const express = require('express');
const axios = require('axios').default;
const fs = require('fs');
const path = require('path');
const app = express();

// Konfigurasi axios dengan timeout
const axiosInstance = axios.create({
    timeout: 35000,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

// Daftar server (container) - akan diupdate dengan MIPS nyata
const servers = [
    { url: 'http://192.168.56.11:31001', mips: 0, totalLoad: 0 },
    { url: 'http://192.168.56.11:31002', mips: 0, totalLoad: 0 },
    { url: 'http://192.168.56.12:31003', mips: 0, totalLoad: 0 },
    { url: 'http://192.168.56.12:31004', mips: 0, totalLoad: 0 },
    { url: 'http://192.168.56.13:31005', mips: 0, totalLoad: 0 },
    { url: 'http://192.168.56.13:31006', mips: 0, totalLoad: 0 }
];

// Daftar endpoint yang valid
const validEndpoints = ['a', 'b', 'c', 'd', 'e'];

// Daftar algoritma yang valid
const validAlgorithms = ['sa', 'hs', 'sahsh', 'dalb', 'fpa'];

// Variabel untuk status keseimbangan
let isBalanced = false;

// Fungsi untuk mengambil MIPS nyata dari container
async function fetchRealMips() {
    for (let server of servers) {
        try {
            const response = await axiosInstance.get(`${server.url}/mips`);
            server.mips = response.data.mips || 500; // Fallback ke 500 jika gagal
            console.log(`Fetched Real MIPS for ${server.url}: ${server.mips}`);
        } catch (error) {
            console.error(`Error fetching MIPS for ${server.url}: ${error.message}`);
            server.mips = 500; // Fallback jika gagal
        }
    }
}

// Ambil MIPS nyata saat startup
fetchRealMips().then(() => {
    console.log('MIPS fetching completed for all containers');
});

// Fungsi cost menggunakan MIPS nyata
function cost(vm, task) {
    return (vm.totalLoad + task) / vm.mips;
}

// Fungsi untuk mendapatkan solusi acak
function getRandomSolution(solutionList) {
    const idx = Math.floor(Math.random() * solutionList.length);
    return { ...solutionList[idx], totalLoad: 0 };
}

// Fungsi untuk menghitung rata-rata waktu pemrosesan
function calculateAvgProcessingTime(solutionList) {
    const totalLoad = solutionList.reduce((sum, vm) => sum + vm.totalLoad, 0);
    return totalLoad / solutionList.length;
}

// Fungsi untuk menghitung standar deviasi
function calculateStdDeviation(solutionList, avg) {
    const variance = solutionList.reduce((sum, vm) => sum + Math.pow(vm.totalLoad - avg, 2), 0) / solutionList.length;
    return Math.sqrt(variance);
}

// Algoritma Simulated Annealing
function simulatedAnnealing(solutionList, task) {
    let T = 1000; // Initial temperature sesuai dengan penyesuaian di SimulatedAnnealingLB.java
    let alpha = 0.25;
    let L = 3;

    let current = getRandomSolution(solutionList);
    let currentCost = cost(current, task);
    current.totalLoad = currentCost * current.mips;

    while (T > 1e-3) {
        for (let i = 0; i < L; i++) {
            let neighbor = getRandomSolution(solutionList);
            let neighborCost = cost(neighbor, task);
            neighbor.totalLoad = neighborCost * neighbor.mips;

            let delta = neighborCost - currentCost;
            if (delta < 0 || Math.exp(-delta / T) > Math.random()) {
                current = neighbor;
                currentCost = neighborCost;
            }
        }
        T *= alpha; // Pendinginan setiap L iterasi
    }

    const selectedServer = servers.find(s => s.url === current.url);
    selectedServer.totalLoad += task;

    // Evaluasi keseimbangan
    const avg = calculateAvgProcessingTime(servers);
    const sd = calculateStdDeviation(servers, avg);
    isBalanced = sd <= avg;

    return selectedServer;
}

// Algoritma Harmony Search
function harmonySearch(solutionList, task) {
    const HMS = 10; // Sesuai HarmonySearchLB.java
    const HMCR = 0.7; // Sesuai HarmonySearchLB.java
    const PAR = 0.5; // Sesuai HarmonySearchLB.java
    const BW = 0.05; // Sesuai HarmonySearchLB.java
    const MAX_ITER = 500; // Sesuai HarmonySearchLB.java

    let harmonyMemory = [];
    for (let i = 0; i < HMS; i++) {
        let vm = getRandomSolution(solutionList);
        vm.fitness = cost(vm, task);
        harmonyMemory.push(vm);
    }

    for (let iter = 0; iter < MAX_ITER; iter++) {
        let newHarmony = { ...harmonyMemory[Math.floor(Math.random() * HMS)] };
        let newFitness;

        if (Math.random() < HMCR) {
            let memoryVm = harmonyMemory[Math.floor(Math.random() * HMS)];
            newHarmony = { ...memoryVm };

            if (Math.random() < PAR) {
                let adjustment = (Math.random() * 2 - 1) * BW;
                let adjustedLoad = memoryVm.totalLoad + (memoryVm.mips * adjustment); // Sesuai dengan mips
                newFitness = cost(newHarmony, adjustedLoad);
            } else {
                newFitness = cost(newHarmony, task);
            }
        } else {
            newHarmony = getRandomSolution(solutionList);
            newFitness = cost(newHarmony, task);
        }

        newHarmony.fitness = newFitness;
        let worstIdx = harmonyMemory.reduce((idx, _, i, arr) => arr[i].fitness > arr[idx].fitness ? i : idx, 0);
        if (newFitness < harmonyMemory[worstIdx].fitness) {
            harmonyMemory[worstIdx] = newHarmony;
        }
    }

    let best = harmonyMemory[0];
    for (let vm of harmonyMemory) {
        if (vm.fitness < best.fitness) best = vm;
    }

    const selectedServer = servers.find(s => s.url === best.url);
    selectedServer.totalLoad += task;

    // Evaluasi keseimbangan
    const avg = calculateAvgProcessingTime(servers);
    const sd = calculateStdDeviation(servers, avg);
    isBalanced = sd <= avg;

    return selectedServer;
}

// Algoritma Hybrid SA-HS
function hybridSAHS(task) {
    let harmonyMemory = [];
    for (let i = 0; i < HMS; i++) {
        const vm = getRandomSolution(servers);
        vm.fitness = calculateFitness(vm, task, servers);
        harmonyMemory.push(vm);
    }

    let T = T0;
    let best = { ...harmonyMemory[0] };
    let bestFitness = best.fitness;

    for (let iter = 0; iter < MAX_ITER; iter++) {
        let newHarmony = { ...harmonyMemory[Math.floor(Math.random() * HMS)] };
        let newFitness;

        if (Math.random() < HMCR) {
            const memoryVm = harmonyMemory[Math.floor(Math.random() * HMS)];
            newHarmony = { ...memoryVm };

            if (Math.random() < PAR) {
                const adjustment = (Math.random() * 2 - 1) * BW;
                const adjustedLoad = memoryVm.totalLoad + (memoryVm.mips * adjustment);
                newFitness = calculateFitness(newHarmony, adjustedLoad, servers);
            } else {
                newFitness = calculateFitness(newHarmony, task, servers);
            }
        } else {
            newHarmony = getRandomSolution(servers);
            newFitness = calculateFitness(newHarmony, task, servers);
        }

        newHarmony.fitness = newFitness;

        const worstIdx = harmonyMemory.reduce((idx, _, i, arr) => arr[i].fitness > arr[idx].fitness ? i : idx, 0);
        const delta = newFitness - harmonyMemory[worstIdx].fitness;

        if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
            harmonyMemory[worstIdx] = newHarmony;
            if (newFitness < bestFitness) {
                best = { ...newHarmony };
                bestFitness = newFitness;
            }
        }

        if ((iter + 1) % L === 0) T *= alpha;
    }

    // Rebalancing step
    const selectedServer = rebalance(servers, task, best);
    selectedServer.totalLoad += task;

    return selectedServer;
}

// Fungsi untuk menghitung fitness (digunakan oleh Hybrid SA-HS) dengan MIPS nyata
function calculateFitness(vm, task, solutionList) {
    const loadAfterAssignment = vm.totalLoad + task;
    const processingTime = loadAfterAssignment / vm.mips;

    // Simulasi penambahan task untuk menghitung avg dan sd
    const originalLoad = vm.totalLoad;
    vm.totalLoad += task;
    const avgTime = calculateAvgProcessingTime(solutionList);
    const sd = calculateStdDeviation(solutionList, avgTime);
    vm.totalLoad = originalLoad; // Revert

    return processingTime + sd * 0.5; // Sesuai dengan HybridSAHSLB.java
}

// Fungsi rebalancing
function rebalance(solutionList, task, currentBest) {
    const originalLoad = currentBest.totalLoad;
    currentBest.totalLoad += task; // Temporarily assign task

    // Hitung imbalance (menggunakan standar deviasi sebagai metrik)
    let avg = calculateAvgProcessingTime(solutionList);
    let imbalance = calculateStdDeviation(solutionList, avg);

    if (imbalance > 0.001) {
        let minLoadVm = solutionList[0];
        for (let vm of solutionList) {
            if ((vm.totalLoad / vm.mips) < (minLoadVm.totalLoad / minLoadVm.mips)) {
                minLoadVm = vm;
            }
        }

        // Revert dan coba assign ke minLoadVm
        currentBest.totalLoad = originalLoad;
        const minLoadOriginal = minLoadVm.totalLoad;
        minLoadVm.totalLoad += task;
        const newAvg = calculateAvgProcessingTime(solutionList);
        const newImbalance = calculateStdDeviation(solutionList, newAvg);

        if (newImbalance < imbalance) {
            return minLoadVm; // Better balance
        } else {
            minLoadVm.totalLoad = minLoadOriginal; // Revert
            currentBest.totalLoad += task; // Restore
        }
    }

    return currentBest;
}

// Algoritma Dragonfly
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
        const s = 0.1, a = 0.1, c = 0.7, f = 1.0, e = 2.0;

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
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Fungsi Flower Pollination Algorithm (versi pure)
function flowerPollinationAlgorithm(solutionList, task) {
    const numFlowers = 80;
    const maxGenerations = 100;
    const switchProbability = 0.8;

    const population = [];
    for (let i = 0; i < numFlowers; i++) {
        const vm = getRandomSolution(solutionList);
        vm.assignment = i % solutionList.length;
        population.push(vm);
    }

    let best = population[0];
    let bestFitness = cost(best, task);

    for (let gen = 0; gen < maxGenerations; gen++) {
        for (let i = 0; i < population.length; i++) {
            let newVm;
            if (Math.random() < switchProbability) {
                const beta = levyFlight();
                const step = Math.floor(beta * (best.assignment - population[i].assignment));
                const newIndex = (population[i].assignment + step + solutionList.length) % solutionList.length;
                newVm = { ...solutionList[newIndex] };
            } else {
                const a = getRandomSolution(solutionList);
                const b = getRandomSolution(solutionList);
                const newIndex = Math.floor(((a.assignment + b.assignment) / 2) % solutionList.length);
                newVm = { ...solutionList[newIndex] };
            }

            const newFitness = cost(newVm, task);
            if (newFitness < bestFitness) {
                best = newVm;
                bestFitness = newFitness;
            }
        }
    }

    const selectedServer = servers.find(s => s.url === best.url);
    selectedServer.totalLoad += task;
    return selectedServer;
}

function levyFlight() {
    const beta = 1.5;
    const sigma = Math.pow(
        (gamma(1 + beta) * Math.sin(Math.PI * beta / 2)) /
        (gamma((1 + beta) / 2) * beta * Math.pow(2, (beta - 1) / 2)),
        1.0 / beta
    );

    const u = randomGaussian() * sigma;
    const v = randomGaussian();
    return u / Math.pow(Math.abs(v), 1 / beta);
}

function gamma(x) {
    const p = [
        676.5203681218851,
        -1259.1392167224028,
        771.32342877765313,
        -176.61502916214059,
        12.507343278686905,
        -0.13857109526572012,
        9.9843695780195716e-6,
        1.5056327351493116e-7
    ];

    const g = 7;
    if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
    x -= 1;
    let a = 0.99999999999980993;
    for (let i = 0; i < p.length; i++) {
        a += p[i] / (x + i + 1);
    }
    const t = x + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

// Parameter Hybrid SA-HS
const HMS = 5;
const HMCR = 0.9;
const PAR = 0.3;
const BW = 0.001;
const MAX_ITER = 1000;
const T0 = 1000;
const alpha = 0.95;
const L = 7;

// Endpoint untuk menerima permintaan API dengan pemilihan algoritma
app.get('/api/:endpoint', async (req, res) => {
    const endpoint = req.params.endpoint;
    const algo = req.query.algo || 'sahsh'; // Default ke Hybrid SA-HS jika ada

    // Validasi endpoint
    if (!validEndpoints.includes(endpoint)) {
        return res.status(400).json({ error: 'Invalid endpoint', details: 'Endpoint must be one of: a, b, c, d, e' });
    }

    // Validasi parameter algo
    if (!req.query.algo || !validAlgorithms.includes(algo.toLowerCase())) {
        return res.status(400).json({ error: 'Invalid or missing algorithm', details: 'Algorithm must be one of: sa, hs, sahsh, dalb, fpa' });
    }

    const startTime = Date.now();
    let targetServer;

    // Pilih algoritma berdasarkan query parameter
    switch (algo.toLowerCase()) {
        case 'sa':
            targetServer = simulatedAnnealing(servers, 0); // Task akan diambil dari respons
            break;
        case 'hs':
            targetServer = harmonySearch(servers, 0);
            break;
        case 'sahsh':
        default:
            targetServer = hybridSAHS(0);
            break;
        case 'dalb':
            targetServer = dragonflyAlgorithm(servers, 0);
            break;
        case 'fpa':
            targetServer = flowerPollinationAlgorithm(servers, 0);
            break;
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

        // Ambil load nyata dari respons aplikasi (processingTime * MIPS)
        const task = response.data.load || executionTime * targetServer.mips;

        // Perbarui totalLoad server dengan load nyata
        targetServer.totalLoad += task;

        console.log(`[${algo.toUpperCase()}] Response from ${targetServer.url}:`, JSON.stringify(response.data));

        // Tentukan path log berdasarkan algoritma
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
            isBalanced: isBalanced
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

// Tangani /api/ (tanpa endpoint)
app.get('/api/', (req, res) => {
    res.status(400).json({ error: 'Invalid endpoint', details: 'Endpoint must be one of: a, b, c, d, e' });
});

app.listen(8080, () => console.log('Load balancer running on port 8080'));