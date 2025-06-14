const express = require('express');
const axios = require('axios').default;
const fs = require('fs');
const path = require('path');
const gamma = require('gamma');
const app = express();

const axiosInstance = axios.create({
    timeout: 180000,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

const servers = [
    { url: 'http://192.168.56.11:31001', mips: 0, totalLoad: 0 },
    { url: 'http://192.168.56.11:31002', mips: 0, totalLoad: 0 },
    { url: 'http://192.168.56.12:31003', mips: 0, totalLoad: 0 },
    { url: 'http://192.168.56.12:31004', mips: 0, totalLoad: 0 },
    { url: 'http://192.168.56.13:31005', mips: 0, totalLoad: 0 },
    { url: 'http://192.168.56.13:31006', mips: 0, totalLoad: 0 }
];

const validEndpoints = ['a', 'b', 'c', 'd', 'e'];
const validAlgorithms = ['sahsh', 'dalb', 'dalevy', 'fpa', 'rr', 'aco', 'hs', 'sa', 'pso', 'ga']; // Tambahkan 'sa'
let isBalanced = false;
let rrIndex = 0;

async function fetchRealMips() {
    for (let server of servers) {
        try {
            const response = await axiosInstance.get(`${server.url}/mips`);
            server.mips = response.data.mips || 500;
            console.log(`Fetched Real MIPS for ${server.url}: ${server.mips}`);
        } catch (error) {
            console.error(`Error fetching MIPS for ${server.url}: ${error.message}`);
            server.mips = 500;
        }
    }
}

fetchRealMips().then(() => {
    console.log('MIPS fetching completed for all containers');
});

function cost(vm, task) {
    return (vm.totalLoad + task) / vm.mips;
}

function getRandomSolution(solutionList) {
    const idx = Math.floor(Math.random() * solutionList.length);
    return { ...solutionList[idx], totalLoad: 0 };
}

function calculateAvgProcessingTime(solutionList) {
    const totalLoad = solutionList.reduce((sum, vm) => sum + vm.totalLoad, 0);
    return totalLoad / solutionList.length;
}

function calculateStdDeviation(solutionList, avg) {
    const variance = solutionList.reduce((sum, vm) => sum + Math.pow(vm.totalLoad - avg, 2), 0) / solutionList.length;
    return Math.sqrt(variance);
}

// Hybrid SA-HS Algorithm based on HybridSAHSLB.java
function hybridSAHS(vmList, task) {
    const HMS = 5;
    const HMCR = 0.9;
    const PAR = 0.3;
    const BW = 0.001;
    const MAX_ITER = 1000;
    const T0 = 1000;
    const alpha = 0.95;
    const L = 7;

    function deepCloneSolution(solution) {
        return solution.map(vm => ({ ...vm }));
    }

    function generateRandomSolution() {
        const solution = vmList.map(vm => ({ ...vm, totalLoad: vm.totalLoad }));
        const index = Math.floor(Math.random() * solution.length);
        solution[index].totalLoad += task;
        return solution;
    }

    function calculateFitness(solution) {
        const avg = calculateAvgProcessingTime(solution);
        const sd = calculateStdDeviation(solution, avg);
        return sd / avg; // imbalance degree
    }

    function pitchAdjust(solution) {
        const adjusted = deepCloneSolution(solution);
        const idxFrom = Math.floor(Math.random() * adjusted.length);
        let idxTo = Math.floor(Math.random() * adjusted.length);
        while (idxTo === idxFrom) idxTo = Math.floor(Math.random() * adjusted.length);

        if (adjusted[idxFrom].totalLoad >= task) {
            adjusted[idxFrom].totalLoad -= task;
            adjusted[idxTo].totalLoad += task;
        }
        return adjusted;
    }

    // Step 1: Initialize Harmony Memory
    const harmonyMemory = [];
    for (let i = 0; i < HMS; i++) {
        const solution = generateRandomSolution();
        const fitness = calculateFitness(solution);
        harmonyMemory.push({ solution, fitness });
    }

    let best = harmonyMemory[0];
    for (let i = 1; i < HMS; i++) {
        if (harmonyMemory[i].fitness < best.fitness) {
            best = harmonyMemory[i];
        }
    }

    let T = T0;

    // Step 2: Iterations
    for (let iter = 0; iter < MAX_ITER; iter++) {
        let newSolution;

        if (Math.random() < HMCR) {
            const memory = harmonyMemory[Math.floor(Math.random() * HMS)];
            newSolution = deepCloneSolution(memory.solution);

            if (Math.random() < PAR) {
                newSolution = pitchAdjust(newSolution);
            }
        } else {
            newSolution = generateRandomSolution();
        }

        const fitness = calculateFitness(newSolution);
        const worstIdx = harmonyMemory.reduce((worst, curr, idx, arr) =>
            curr.fitness > arr[worst].fitness ? idx : worst, 0
        );

        const delta = fitness - harmonyMemory[worstIdx].fitness;
        if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
            harmonyMemory[worstIdx] = { solution: newSolution, fitness };
            if (fitness < best.fitness) {
                best = { solution: deepCloneSolution(newSolution), fitness };
            }
        }

        if ((iter + 1) % L === 0) T *= alpha;
    }

    // Step 3: Apply best solution back to original VM list
    best.solution.forEach((vm, i) => {
        vmList[i].totalLoad = vm.totalLoad;
    });

    isBalanced = best.fitness <= 0.1; // threshold bisa disesuaikan
    return vmList.reduce((a, b) =>
        (a.totalLoad / a.mips < b.totalLoad / b.mips ? a : b)
    );
}

// Harmony Search Algorithm
function harmonySearch(vmList, task) {
    const HMS = 10; // Harmony Memory Size
    const HMCR = 0.7; // Harmony Memory Considering Rate
    const PAR = 0.5; // Pitch Adjustment Rate
    const BW = 0.05; // Band Width
    const MAX_ITER = 500;

    function deepClone(solution) {
        return solution.map(vm => ({ ...vm }));
    }

    function generateRandomSolution() {
        const solution = vmList.map(vm => ({ ...vm, totalLoad: vm.totalLoad }));
        const idx = Math.floor(Math.random() * solution.length);
        solution[idx].totalLoad += task;
        return solution;
    }

    function calculateFitness(solution) {
        const avg = calculateAvgProcessingTime(solution);
        const sd = calculateStdDeviation(solution, avg);
        return sd / avg; // Imbalance degree
    }

    function pitchAdjust(solution) {
        const adjusted = deepClone(solution);
        const idxFrom = Math.floor(Math.random() * adjusted.length);
        let idxTo = Math.floor(Math.random() * adjusted.length);
        while (idxTo === idxFrom) idxTo = Math.floor(Math.random() * adjusted.length);

        const transfer = Math.max(1, Math.round(task * 0.2));
        if (adjusted[idxFrom].totalLoad >= transfer) {
            adjusted[idxFrom].totalLoad -= transfer;
            adjusted[idxTo].totalLoad += transfer;
        }
        return adjusted;
    }

    // Initialize Harmony Memory
    const harmonyMemory = [];
    for (let i = 0; i < HMS; i++) {
        const solution = generateRandomSolution();
        const fitness = calculateFitness(solution);
        harmonyMemory.push({ solution, fitness });
    }

    let best = harmonyMemory[0];
    for (let i = 1; i < HMS; i++) {
        if (harmonyMemory[i].fitness < best.fitness) {
            best = harmonyMemory[i];
        }
    }

    // Main HS loop
    for (let iter = 0; iter < MAX_ITER; iter++) {
        let newSolution;

        if (Math.random() < HMCR) {
            const memory = harmonyMemory[Math.floor(Math.random() * HMS)];
            newSolution = deepClone(memory.solution);

            if (Math.random() < PAR) {
                newSolution = pitchAdjust(newSolution);
            }
        } else {
            newSolution = generateRandomSolution();
        }

        const fitness = calculateFitness(newSolution);
        const worstIdx = harmonyMemory.reduce((worst, curr, idx, arr) =>
            curr.fitness > arr[worst].fitness ? idx : worst, 0
        );

        if (fitness < harmonyMemory[worstIdx].fitness) {
            harmonyMemory[worstIdx] = { solution: deepClone(newSolution), fitness };
            if (fitness < best.fitness) {
                best = { solution: deepClone(newSolution), fitness };
            }
        }
    }

    // Apply best solution back to original VM list
    best.solution.forEach((vm, i) => {
        vmList[i].totalLoad = vm.totalLoad;
    });

    isBalanced = best.fitness <= 0.1;
    return vmList.reduce((a, b) => a.totalLoad / a.mips < b.totalLoad / b.mips ? a : b);
}

// Simulated Annealing Algorithm
function simulatedAnnealing(vmList, task) {
    let T = 2000;
    const alpha = 0.25;
    const L = 3;

    function deepClone(solution) {
        return solution.map(vm => ({ ...vm }));
    }
    function generateRandomSolution() {
        const solution = vmList.map(vm => ({ ...vm, totalLoad: vm.totalLoad }));
        const idx = Math.floor(Math.random() * solution.length);
        solution[idx].totalLoad += task;
        return solution;
    }
    function calculateFitness(solution) {
        const avg = calculateAvgProcessingTime(solution);
        const sd = calculateStdDeviation(solution, avg);
        return sd / avg;
    }
    function neighbor(solution) {
        const next = deepClone(solution);
        const idxFrom = Math.floor(Math.random() * next.length);
        let idxTo = Math.floor(Math.random() * next.length);
        while (idxTo === idxFrom) idxTo = Math.floor(Math.random() * next.length);

        const transfer = Math.max(1, Math.round(task * 0.2));
        if (next[idxFrom].totalLoad >= transfer) {
            next[idxFrom].totalLoad -= transfer;
            next[idxTo].totalLoad += transfer;
        }
        return next;
    }

    let current = generateRandomSolution();
    let currentFitness = calculateFitness(current);
    let best = deepClone(current);
    let bestFitness = currentFitness;

    while (T > 1e-3) {
        for (let i = 0; i < L; i++) {
            const candidate = neighbor(current);
            const candidateFitness = calculateFitness(candidate);
            const delta = candidateFitness - currentFitness;
            if (delta < 0 || Math.exp(-delta / T) > Math.random()) {
                current = deepClone(candidate);
                currentFitness = candidateFitness;
                if (candidateFitness < bestFitness) {
                    best = deepClone(candidate);
                    bestFitness = candidateFitness;
                }
            }
        }
        T *= alpha;
    }

    best.forEach((vm, i) => {
        vmList[i].totalLoad = vm.totalLoad;
    });
    isBalanced = bestFitness <= 0.1;
    return vmList.reduce((a, b) => a.totalLoad / a.mips < b.totalLoad / b.mips ? a : b);
}

// DA BROWNIAN
function dragonflyAlgorithm(solutionList, task) {
    const maxIterations = 500;
    const populationSize = 30;
    const dimension = solutionList.length;
    const initialRadius = 0.5;
    const motionTime = 0.01;

    const position = Array.from({ length: populationSize }, () => Array.from({ length: dimension }, () => Math.random()));
    const velocity = Array.from({ length: populationSize }, () => Array(dimension).fill(0));

    let bestPosition = Array(dimension).fill(0);
    let bestFitness = Infinity;

    for (let iter = 0; iter < maxIterations; iter++) {
        const radius = initialRadius * (1 - iter / maxIterations);
        const w = 0.9 - (iter / maxIterations) * 0.7;
        const s = 0.1, a = 0.1, c = 0.7, f = 1.0, e = 3.0;

        for (let i = 0; i < populationSize; i++) {
            const fitness = calculateDAFitness(position[i], solutionList, task);
            if (fitness < bestFitness) {
                bestFitness = fitness;
                bestPosition = [...position[i]];
            }
        }

        for (let i = 0; i < populationSize; i++) {
            let S = Array(dimension).fill(0), A = Array(dimension).fill(0), C = Array(dimension).fill(0);
            let neighborCount = 0;

            for (let j = 0; j < populationSize; j++) {
                if (i === j) continue;
                const dist = Math.sqrt(position[i].reduce((sum, _, d) => sum + Math.pow(position[i][d] - position[j][d], 2), 0));
                if (dist <= radius) {
                    neighborCount++;
                    for (let d = 0; d < dimension; d++) {
                        S[d] += position[i][d] - position[j][d];
                        A[d] += velocity[j][d];
                        C[d] += position[j][d];
                    }
                }
            }

            for (let d = 0; d < dimension; d++) {
                if (neighborCount > 0) {
                    S[d] /= neighborCount;
                    A[d] /= neighborCount;
                    C[d] = (C[d] / neighborCount) - position[i][d];
                } else {
                    const T = motionTime;
                    const N = 100 * T;
                    const h = Math.sqrt(T / (N * N));
                    const Pg = (1 / (h * Math.sqrt(2 * Math.PI))) *
                        Math.exp(-(Math.pow(dimension - solutionList.length, 2)) / (2 * h * h));
                    const gaussian = randomGaussian();
                    position[i][d] += h * gaussian * Pg;
                    position[i][d] = Math.min(1, Math.max(0, position[i][d]));
                }
            }

            for (let d = 0; d < dimension; d++) {
                const F = bestPosition[d] - position[i][d];
                const E = position[i][d] - bestPosition[d];
                velocity[i][d] = s * S[d] + a * A[d] + c * C[d] + f * F + e * E + w * velocity[i][d];
                position[i][d] += velocity[i][d];
                position[i][d] = Math.min(1, Math.max(0, position[i][d]));
            }
        }
    }

    let selectedIndex = -1;
    let bestUtil = Infinity;

    for (let i = 0; i < dimension; i++) {
        if (bestPosition[i] > 0.5) {
            const vm = solutionList[i];
            const predicted = vm.totalLoad + task;
            const util = predicted / vm.mips;
            if (util < bestUtil) {
                bestUtil = util;
                selectedIndex = i;
            }
        }
    }

    if (selectedIndex === -1) {
        selectedIndex = Math.floor(Math.random() * dimension);
    }

    const selected = solutionList[selectedIndex];
    selected.totalLoad += task;
    return selected;
}

function calculateDAFitness(positionVector, vmList, task) {
    return positionVector.reduce((sum, pos, i) => {
        const vm = vmList[i];
        const addedLoad = pos > 0.5 ? task : 0;
        const load = vm.totalLoad + addedLoad;
        const util = load / vm.mips;
        return sum + Math.pow(util - 1.0, 2);
    }, 0);
}

function randomGaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// DA LEVY
function dragonflyLevyAlgorithm(solutionList, task) {
    const maxIterations = 500;
    const populationSize = 30;
    const dimension = solutionList.length;
    const initialRadius = 0.5;

    const position = Array.from({ length: populationSize }, () => Array.from({ length: dimension }, () => Math.random()));
    const velocity = Array.from({ length: populationSize }, () => Array(dimension).fill(0));

    let bestPosition = Array(dimension).fill(0);
    let bestFitness = Infinity;

    for (let iter = 0; iter < maxIterations; iter++) {
        const radius = initialRadius * (1 - iter / maxIterations);
        const w = 0.9 - (iter / maxIterations) * 0.7;
        const s = 0.1, a = 0.1, c = 0.7, f = 1.0, e = 4.0;

        for (let i = 0; i < populationSize; i++) {
            const fitness = calculateDAFitness(position[i], solutionList, task);
            if (fitness < bestFitness) {
                bestFitness = fitness;
                bestPosition = [...position[i]];
            }
        }

        for (let i = 0; i < populationSize; i++) {
            let S = Array(dimension).fill(0), A = Array(dimension).fill(0), C = Array(dimension).fill(0);
            let neighborCount = 0;

            for (let j = 0; j < populationSize; j++) {
                if (i === j) continue;
                const dist = Math.sqrt(position[i].reduce((sum, _, d) => sum + Math.pow(position[i][d] - position[j][d], 2), 0));
                if (dist <= radius) {
                    neighborCount++;
                    for (let d = 0; d < dimension; d++) {
                        S[d] += position[i][d] - position[j][d];
                        A[d] += velocity[j][d];
                        C[d] += position[j][d];
                    }
                }
            }

            for (let d = 0; d < dimension; d++) {
                if (neighborCount > 0) {
                    S[d] /= neighborCount;
                    A[d] /= neighborCount;
                    C[d] = (C[d] / neighborCount) - position[i][d];
                } else {
                    velocity[i][d] = levyFlightStep(1.5);
                }
            }

            for (let d = 0; d < dimension; d++) {
                const F = bestPosition[d] - position[i][d];
                const E = position[i][d] - bestPosition[d];
                velocity[i][d] = s * S[d] + a * A[d] + c * C[d] + f * F + e * E + w * velocity[i][d];
                position[i][d] += velocity[i][d];
                position[i][d] = Math.min(1, Math.max(0, position[i][d]));
            }
        }
    }

    let selectedIndex = -1;
    let bestUtil = Infinity;

    for (let i = 0; i < dimension; i++) {
        if (bestPosition[i] > 0.5) {
            const vm = solutionList[i];
            const predicted = vm.totalLoad + task;
            const util = predicted / vm.mips;
            if (util < bestUtil) {
                bestUtil = util;
                selectedIndex = i;
            }
        }
    }

    if (selectedIndex === -1) {
        selectedIndex = Math.floor(Math.random() * dimension);
    }

    const selected = solutionList[selectedIndex];
    selected.totalLoad += task;
    return selected;
}

function levyFlightStep(beta) {
    const sigma = Math.pow(
        (gamma(1 + beta) * Math.sin(Math.PI * beta / 2)) /
        (gamma((1 + beta) / 2) * beta * Math.pow(2, (beta - 1) / 2)),
        1 / beta
    );

    const u = randomGaussian() * sigma;
    const v = randomGaussian();
    return 0.01 * (u / Math.pow(Math.abs(v), 1 / beta));
}

// FPA
function flowerPollinationAlgorithm(servers, task) {
    const numFlowers = 50;
    const maxGenerations = 100;
    const switchProbability = 0.8;

    const population = Array.from({ length: numFlowers }, () => {
        return servers.map(vm => ({
            ...vm,
            totalLoad: vm.totalLoad
        }));
    });

    let bestSolution = population[0];
    let bestFitness = calculatePopulationFitness(bestSolution);

    for (let gen = 0; gen < maxGenerations; gen++) {
        for (let i = 0; i < population.length; i++) {
            const current = population[i];
            let candidate;

            if (Math.random() < switchProbability) {
                const beta = levyFlight();
                const step = Math.floor(beta * servers.length);
                const index = Math.abs(step % servers.length);

                candidate = current.map((vm, idx) => ({
                    ...vm,
                    totalLoad: idx === index ? vm.totalLoad + task : vm.totalLoad
                }));
            } else {
                const a = population[Math.floor(Math.random() * population.length)];
                const b = population[Math.floor(Math.random() * population.length)];
                const mid = Math.floor(((a.length + b.length) / 2) % servers.length);

                candidate = current.map((vm, idx) => ({
                    ...vm,
                    totalLoad: idx === mid ? vm.totalLoad + task : vm.totalLoad
                }));
            }

            const candidateFitness = calculatePopulationFitness(candidate);
            const currentFitness = calculatePopulationFitness(current);

            if (candidateFitness < currentFitness) {
                population[i] = candidate;
                if (candidateFitness < bestFitness) {
                    bestSolution = candidate;
                    bestFitness = candidateFitness;
                }
            }
        }
    }

    const selected = bestSolution.reduce((a, b) =>
        (a.totalLoad / a.mips < b.totalLoad / b.mips ? a : b)
    );

    const realServer = servers.find(s => s.url === selected.url);
    realServer.totalLoad += task;

    return realServer;
}

function calculatePopulationFitness(vmList) {
    const avg = vmList.reduce((sum, vm) => sum + (vm.totalLoad / vm.mips), 0) / vmList.length;
    const variance = vmList.reduce((sum, vm) =>
        sum + Math.pow((vm.totalLoad / vm.mips) - avg, 2), 0
    ) / vmList.length;
    return Math.sqrt(variance);
}

function levyFlight() {
    const beta = 1.5;
    const sigma = Math.pow(
        (gamma(1 + beta) * Math.sin(Math.PI * beta / 2)) /
        (gamma((1 + beta) / 2) * beta * Math.pow(2, (beta - 1) / 2)),
        1 / beta
    );

    const u = randomGaussian() * sigma;
    const v = randomGaussian();
    return u / Math.pow(Math.abs(v), 1 / beta);
}

// ACO
function antColonyOptimization(solutionList, task) {
    const numAnts = 30;
    const generations = 50;
    const evaporationRate = 0.1;
    const alpha = 1.0;
    const beta = 2.0;

    const numVMs = solutionList.length;
    const pheromone = Array.from({ length: 1 }, () => Array(numVMs).fill(1.0));

    let globalBestIndex = null;
    let globalBestFitness = Infinity;

    for (let gen = 0; gen < generations; gen++) {
        for (let k = 0; k < numAnts; k++) {
            const selectedIndex = selectVmIndex(0, solutionList, pheromone, task);
            const fitness = calculateFitnessACO([selectedIndex], solutionList, task);

            if (fitness < globalBestFitness) {
                globalBestFitness = fitness;
                globalBestIndex = selectedIndex;
            }
        }

        for (let j = 0; j < numVMs; j++) {
            pheromone[0][j] *= (1.0 - evaporationRate);
            if (pheromone[0][j] < 0.0001) pheromone[0][j] = 0.0001;
        }

        pheromone[0][globalBestIndex] += 1.0 / (1.0 + globalBestFitness);
    }

    const selected = solutionList[globalBestIndex];
    selected.totalLoad += task;
    return selected;
}

function selectVmIndex(cloudletIndex, vms, pheromone, task) {
    const numVMs = vms.length;
    const probabilities = [];
    let sum = 0.0;

    for (let j = 0; j < numVMs; j++) {
        const pher = Math.pow(pheromone[cloudletIndex][j], 1.0);
        const heuristic = Math.pow(vms[j].mips / (task || 1), 2.0);
        const prob = pher * heuristic;
        probabilities.push(prob);
        sum += prob;
    }

    if (sum === 0) return Math.floor(Math.random() * numVMs);

    const rand = Math.random() * sum;
    let cumulative = 0;
    for (let j = 0; j < numVMs; j++) {
        cumulative += probabilities[j];
        if (rand <= cumulative) return j;
    }
    return numVMs - 1;
}

function calculateFitnessACO(solution, vms, task) {
    const vmLoads = Array(vms.length).fill(0);

    for (let i = 0; i < solution.length; i++) {
        const vmIdx = solution[i];
        vmLoads[vmIdx] += task;
    }

    const avg = vmLoads.reduce((a, b) => a + b, 0) / vms.length;
    const max = Math.max(...vmLoads);
    return max - avg;
}

// ROUND ROBIN
let simpleRRCounter = 0;

function roundRobin(task) {
    const index = simpleRRCounter % servers.length;
    const selected = servers[index];
    selected.totalLoad += task;
    simpleRRCounter++;
    return selected;
}

// PSO
function particleSwarmOptimization(vmList, task) {
    const MAX_ITER = 50;
    const SWARM_SIZE = 30;
    const C1 = 2.0;
    const C2 = 2.0;

    const vmCount = vmList.length;
    const position = new Array(SWARM_SIZE).fill(0).map(() => [Math.floor(Math.random() * vmCount)]);
    const velocity = new Array(SWARM_SIZE).fill(0).map(() => [Math.floor(Math.random() * vmCount) - Math.floor(vmCount / 2)]);

    const pBest = position.map(p => [...p]);
    const pBestFitness = pBest.map(p => calculateFitnessPSO(vmList, p[0], task));

    let gBest = [...pBest[0]];
    let gBestFitness = pBestFitness[0];

    for (let i = 1; i < SWARM_SIZE; i++) {
        if (pBestFitness[i] < gBestFitness) {
            gBest = [...pBest[i]];
            gBestFitness = pBestFitness[i];
        }
    }

    for (let iter = 0; iter < MAX_ITER; iter++) {
        for (let i = 0; i < SWARM_SIZE; i++) {
            const r1 = Math.random();
            const r2 = Math.random();

            velocity[i][0] = Math.round(
                velocity[i][0]
                + C1 * r1 * (pBest[i][0] - position[i][0])
                + C2 * r2 * (gBest[0] - position[i][0])
            );

            position[i][0] += velocity[i][0];

            if (position[i][0] < 0) position[i][0] = 0;
            if (position[i][0] >= vmCount) position[i][0] = vmCount - 1;

            const fitness = calculateFitnessPSO(vmList, position[i][0], task);

            if (fitness < pBestFitness[i]) {
                pBest[i][0] = position[i][0];
                pBestFitness[i] = fitness;

                if (fitness < gBestFitness) {
                    gBest = [...pBest[i]];
                    gBestFitness = fitness;
                }
            }
        }
    }

    // Update selected VM's load
    const selectedVm = vmList[gBest[0]];
    selectedVm.totalLoad += task;

    return selectedVm;
}

function calculateFitnessPSO(vmList, selectedIndex, task) {
    const loads = vmList.map(vm => vm.totalLoad);
    loads[selectedIndex] += task;

    return Math.max(...loads); // minimize makespan
}

// GA
// function geneticLoadBalancer(vmList, task) {
//     const POPULATION_SIZE = 20;
//     const MAX_GENERATIONS = 50;
//     const CROSSOVER_RATE = 0.8;
//     const MUTATION_RATE = 0.1;

//     const vmCount = vmList.length;
//     const population = [];

//     // Step 1: Initialize population
//     for (let i = 0; i < POPULATION_SIZE; i++) {
//         const vmIndex = Math.floor(Math.random() * vmCount);
//         const fit = fitnessGA(vmList, vmIndex, task);
//         population.push({ vmIndex, fitness: fit });
//     }

//     // Step 2: Evolution loop
//     for (let gen = 0; gen < MAX_GENERATIONS; gen++) {
//         const newPopulation = [];

//         while (newPopulation.length < POPULATION_SIZE) {
//             const parent1 = selectChromosome(population);
//             const parent2 = selectChromosome(population);

//             if (Math.random() < CROSSOVER_RATE) {
//                 const offspringIndex = Math.floor((parent1.vmIndex + parent2.vmIndex) / 2);
//                 const boundedIndex = Math.min(vmCount - 1, Math.max(0, offspringIndex));
//                 const fit = fitnessGA(vmList, boundedIndex, task);
//                 newPopulation.push({ vmIndex: boundedIndex, fitness: fit });
//             } else {
//                 newPopulation.push({ vmIndex: parent1.vmIndex, fitness: parent1.fitness });
//             }
//         }

//         // Mutation
//         for (const ch of newPopulation) {
//             if (Math.random() < MUTATION_RATE) {
//                 ch.vmIndex = Math.floor(Math.random() * vmCount);
//                 ch.fitness = fitnessGA(vmList, ch.vmIndex, task);
//             }
//         }

//         population.length = 0;
//         population.push(...newPopulation);
//     }

//     // Step 3: Return best solution
//     const best = population.reduce((a, b) => (a.fitness < b.fitness ? a : b));
//     const selectedVm = vmList[best.vmIndex];
//     selectedVm.totalLoad += task;

//     return selectedVm;
// }

// function selectChromosome(population) {
//     return population[Math.floor(Math.random() * population.length)];
// }

// function fitnessGA(vmList, selectedIndex, task) {
//     const loads = vmList.map(vm => vm.totalLoad);
//     loads[selectedIndex] += task;
//     return Math.max(...loads); // minimize makespan
// }

function geneticLoadBalancer(vmList, task) {
    const POP_SIZE = 30;
    const MAX_GEN = 50;
    const CROSSOVER_RATE = 0.8;
    const MUTATION_RATE = 0.1;

    // Pastikan task diperlakukan sebagai array (meskipun cuma satu angka)
    const taskArray = [task];  // Konversi scalar ke array
    const taskCount = taskArray.length;
    const vmCount = vmList.length;

    // 1. Inisialisasi populasi
    let population = [];
    for (let i = 0; i < POP_SIZE; i++) {
        const assignment = Array.from({ length: taskCount }, () => Math.floor(Math.random() * vmCount));
        const fitness = evaluateFitness(assignment, vmList, taskArray);
        population.push({ assignment, fitness });
    }

    // 2. Evolusi
    for (let gen = 0; gen < MAX_GEN; gen++) {
        const newPopulation = [];

        while (newPopulation.length < POP_SIZE) {
            const p1 = select(population);
            const p2 = select(population);
            let child = { assignment: [...p1.assignment] };

            // Crossover 1-point
            if (Math.random() < CROSSOVER_RATE) {
                const point = Math.floor(Math.random() * taskCount);
                child.assignment = p1.assignment.slice(0, point).concat(p2.assignment.slice(point));
            }

            // Mutasi
            for (let t = 0; t < taskCount; t++) {
                if (Math.random() < MUTATION_RATE) {
                    child.assignment[t] = Math.floor(Math.random() * vmCount);
                }
            }

            child.fitness = evaluateFitness(child.assignment, vmList, taskArray);
            newPopulation.push(child);
        }

        population = newPopulation;
    }

    // 3. Pilih solusi terbaik
    const best = population.reduce((a, b) => (a.fitness < b.fitness ? a : b));
    const bestAssignment = best.assignment;

    // 4. Terapkan hasilnya ke VM
    for (let i = 0; i < taskCount; i++) {
        const selectedVm = vmList[bestAssignment[i]];
        selectedVm.totalLoad += taskArray[i];
        return selectedVm; // kembalikan satu VM (karena cuma satu task)
    }

    // Fallback: kalau gagal
    return vmList[0];
}

function select(population) {
    return population[Math.floor(Math.random() * population.length)];
}

function evaluateFitness(assignment, vmList, tasks) {
    const vmLoads = Array(vmList.length).fill(0);
    for (let i = 0; i < assignment.length; i++) {
        vmLoads[assignment[i]] += tasks[i];
    }
    const maxLoad = Math.max(...vmLoads);
    const avgLoad = vmLoads.reduce((a, b) => a + b, 0) / vmLoads.length;
    return maxLoad - avgLoad;
}




app.get('/api/:endpoint', async (req, res) => {
    const endpoint = req.params.endpoint;
    const algo = req.query.algo || 'sahsh';

    if (!validEndpoints.includes(endpoint)) {
        return res.status(400).json({ error: 'Invalid endpoint', details: 'Endpoint must be one of: a, b, c, d, e' });
    }

    if (!req.query.algo || !validAlgorithms.includes(algo.toLowerCase())) {
        return res.status(400).json({ error: 'Invalid or missing algorithm', details: 'Algorithm must be one of: sahsh, dalb, dalevy, fpa, rr, aco, hs, sa, pso, ga' });
    }

    const startTime = Date.now();
    let targetServer;

    switch (algo.toLowerCase()) {
        case 'sahsh':
            targetServer = hybridSAHS(servers, 0);
            break;
        case 'dalb':
            targetServer = dragonflyAlgorithm(servers, 0);
            break;
        case 'dalevy':
            targetServer = dragonflyLevyAlgorithm(servers, 0);
            break;
        case 'fpa':
            targetServer = flowerPollinationAlgorithm(servers, 0);
            break;
        case 'rr':
            targetServer = roundRobin(0);
            break;
        case 'pso':
            targetServer = particleSwarmOptimization(servers, 0);
            break;
        case 'ga':
            targetServer = geneticLoadBalancer(servers, 0);
            break;
        case 'aco':
            targetServer = antColonyOptimization(servers, 0);
            break;
        case 'hs':
            targetServer = harmonySearch(servers, 0);
            break;
        case 'sa':
            targetServer = simulatedAnnealing(servers, 0);
            break;
        default:
            targetServer = hybridSAHS(servers, 0);
    }

    const waitTime = Date.now() - startTime;

    try {
        console.log(`[${algo.toUpperCase()}] Forwarding to ${targetServer.url}/api/${endpoint}`);
        const response = await axiosInstance.get(`${targetServer.url}/api/${endpoint}`);
        const finishTime = Date.now();
        const executionTime = finishTime - (startTime + waitTime);

        if (!response.data || typeof response.data !== 'object') {
            throw new Error('Invalid JSON response from server');
        }

        const task = response.data.load || executionTime * targetServer.mips;

        targetServer.totalLoad += task;

        console.log(`[${algo.toUpperCase()}] Response from ${targetServer.url}:`, JSON.stringify(response.data));

        const logDir = path.join('/logs', algo.toLowerCase());
        const logFile = path.join(logDir, 'log.json');
        const errorLogFile = path.join(logDir, 'error.log');

        const logEntry = {
            endpoint,
            startTime,
            waitTime,
            executionTime,
            finishTime,
            server: targetServer.url,
            algorithm: algo,
            load: task,
            mips: targetServer.mips,
        };

        let log = [];
        try {
            if (fs.existsSync(logFile)) {
                const fileContent = fs.readFileSync(logFile, 'utf8').trim();
                if (fileContent) log = JSON.parse(fileContent);
            }
            log.push(logEntry);
            fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
        } catch (logError) {
            console.error(`[${algo.toUpperCase()}] Error writing to log file: ${logError.message}`);
        }

        res.json(response.data);
    } catch (error) {
        const errorMsg = `[${algo.toUpperCase()}] Error forwarding to ${targetServer.url}: ${error.message}`;
        console.error(errorMsg);
        console.error(`[${algo.toUpperCase()}] Error details:`, error.response ? error.response.data : error);

        const errorLogFile = path.join('/logs', algo.toLowerCase(), 'error.log');
        fs.appendFileSync(
            errorLogFile,
            `${new Date().toISOString()} - ${errorMsg}\n`
        );

        res.status(500).json({ error: 'Server error', details: error.message });
    }
});

app.get('/api/', (req, res) => {
    res.status(400).json({ error: 'Invalid endpoint', details: 'Endpoint must be one of: a, b, c, d, e' });
});

app.listen(8080, () => console.log('Load balancer running on port 8080'));