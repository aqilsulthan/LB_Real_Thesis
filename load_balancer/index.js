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

// Daftar server (container)
const servers = [
    { url: 'http://192.168.56.11:31001', mips: 500, totalLoad: 0 },
    { url: 'http://192.168.56.11:31002', mips: 1000, totalLoad: 0 },
    { url: 'http://192.168.56.12:31003', mips: 500, totalLoad: 0 },
    { url: 'http://192.168.56.12:31004', mips: 1000, totalLoad: 0 },
    { url: 'http://192.168.56.13:31005', mips: 500, totalLoad: 0 },
    { url: 'http://192.168.56.13:31006', mips: 1000, totalLoad: 0 }
];

// Fungsi untuk menghitung beban dinamis
function getDynamicLoad(endpoint) {
    const baseLoads = { a: 2000, b: 3000, c: 4000, d: 5000, e: 6000 };
    return Math.floor(Math.random() * 2000) + baseLoads[endpoint];
}

// Fungsi cost
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
    let isBalanced = false;
    let T = 1000;
    let alpha = 0.25;
    let L = 3;

    let current = getRandomSolution(solutionList);
    let currentCost = cost(current, task);
    current.totalLoad = currentCost * current.mips;

    while (T > 0.001) {
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
        T *= alpha;
    }

    current.totalLoad += task;
    let avgTime = calculateAvgProcessingTime(solutionList);
    let sd = calculateStdDeviation(solutionList, avgTime);
    isBalanced = sd <= avgTime;

    return current;
}

// Algoritma Harmony Search
function harmonySearch(solutionList, task) {
    let isBalanced = false;
    const HMS = 5;
    const HMCR = 0.9;
    const PAR = 0.3;
    const BW = 0.001;
    const MAX_ITER = 1000;

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
                let adjustedLoad = memoryVm.totalLoad + (memoryVm.mips * adjustment);
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

    best.totalLoad += task;
    let avg = calculateAvgProcessingTime(solutionList);
    let sd = calculateStdDeviation(solutionList, avg);
    isBalanced = sd <= avg;

    return best;
}

// Algoritma Hybrid SA-HS
function hybridSAHS(task) {
    let harmonyMemory = [];
    for (let i = 0; i < HMS; i++) {
        const vm = getRandomSolution(servers);
        vm.fitness = calculateFitness(vm, task);
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
                newFitness = calculateFitness(newHarmony, adjustedLoad);
            } else {
                newFitness = calculateFitness(newHarmony, task);
            }
        } else {
            newHarmony = getRandomSolution(servers);
            newFitness = calculateFitness(newHarmony, task);
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

    const selectedServer = servers.find(s => s.url === best.url);
    selectedServer.totalLoad += task;
    return selectedServer;
}

// Fungsi untuk menghitung fitness (digunakan oleh Hybrid SA-HS)
function calculateFitness(vm, task) {
    const loadAfterAssignment = vm.totalLoad + task;
    return loadAfterAssignment / vm.mips;
}

// Parameter Hybrid SA-HS
const HMS = 5;
const HMCR = 0.9;
const PAR = 0.3;
const BW = 0.001;
const MAX_ITER = 500;
const T0 = 1000;
const alpha = 0.95;
const L = 7;

// Endpoint untuk menerima permintaan API dengan pemilihan algoritma
app.get('/api/:endpoint', async (req, res) => {
    const endpoint = req.params.endpoint;
    const task = getDynamicLoad(endpoint);
    const startTime = Date.now();
    let targetServer;

    // Pilih algoritma berdasarkan query parameter (misalnya, ?algo=sa, hs, atau sahsh)
    const algo = req.query.algo || 'sahsh'; // Default ke Hybrid SA-HS
    switch (algo.toLowerCase()) {
        case 'sa':
            targetServer = simulatedAnnealing(servers, task);
            break;
        case 'hs':
            targetServer = harmonySearch(servers, task);
            break;
        case 'sahsh':
        default:
            targetServer = hybridSAHS(task);
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
            algorithm: algo
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

app.listen(8080, () => console.log('Load balancer running on port 8080'));