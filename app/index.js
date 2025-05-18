// const express = require('express');
// const app = express();

// const loads = {
//     a: 2000,  // Sesuai base load di load balancer
//     b: 3000,
//     c: 4000,
//     d: 5000,
//     e: 6000
// };

// app.get('/api/:endpoint', (req, res) => {
//     const endpoint = req.params.endpoint;
//     const load = loads[endpoint] || 2000;
//     setTimeout(() => {
//         res.json({ status: 'done', load });
//     }, load);
// });

// app.listen(3000, () => console.log('App running on port 3000'));

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const app = express();

// Variabel untuk menyimpan MIPS nyata
let realMips = 0;

// Fungsi untuk menghitung MIPS nyata dengan benchmark
function calculateRealMips() {
    const iterations = 100000000; // Jumlah iterasi untuk benchmark
    const startTime = Date.now();
    let sum = 0;

    // Lakukan operasi sederhana (aritmatika) untuk mengukur performa
    for (let i = 0; i < iterations; i++) {
        sum += Math.sin(i) * Math.cos(i); // Operasi floating-point
    }

    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000; // Durasi dalam detik

    // Asumsi: 1 iterasi = 10 instruksi (sin dan cos masing-masing ~5 instruksi)
    const instructions = iterations * 10; // Total instruksi
    const mips = (instructions / durationSeconds) / 1000000; // Konversi ke MIPS

    console.log(`Calculated Real MIPS: ${mips}`);
    return mips;
}

// Hitung MIPS saat startup
realMips = calculateRealMips();

// Fungsi untuk menghasilkan array besar sebagai data input
function generateLargeArray(size) {
    const arr = [];
    for (let i = 0; i < size; i++) {
        arr.push(Math.random() * 1000000);
    }
    return arr;
}

// Mapping endpoint ke intensitas beban (ukuran array dan iterasi)
const workloadConfig = {
    a: { arraySize: 200000, iterations: 1 },  // ~2 detik
    b: { arraySize: 300000, iterations: 2 },  // ~3 detik
    c: { arraySize: 400000, iterations: 3 },  // ~4 detik
    d: { arraySize: 500000, iterations: 4 },  // ~5 detik
    e: { arraySize: 600000, iterations: 5 }   // ~6 detik
};

// Endpoint untuk mendapatkan MIPS nyata
app.get('/mips', (req, res) => {
    res.json({ mips: realMips });
});

app.get('/api/:endpoint', (req, res) => {
    const endpoint = req.params.endpoint;
    const config = workloadConfig[endpoint] || workloadConfig.a; // Default ke 'a'

    const startTime = Date.now();

    // Tugas nyata 1: Pengolahan data (sorting dan transformasi)
    const data = generateLargeArray(config.arraySize);
    for (let i = 0; i < config.iterations; i++) {
        // Sorting array besar
        data.sort((a, b) => a - b);

        // Transformasi data (contoh: menghitung kuadrat)
        const transformed = data.map(x => x * x);
        
        // Simulasi operasi berat lainnya: hashing
        const hash = crypto.createHash('sha256').update(JSON.stringify(transformed)).digest('hex');
    }

    // Tugas nyata 2: Operasi I/O (menulis hasil ke file sementara)
    const tempFile = path.join('/tmp', `result-${endpoint}-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, JSON.stringify(data.slice(0, 1000))); // Tulis sebagian data
    fs.unlinkSync(tempFile); // Hapus file setelah selesai

    const processingTime = Date.now() - startTime;

    // Hitung load sebagai processingTime * MIPS
    const load = processingTime * realMips;

    res.json({
        status: 'done',
        load: load,
        processingTime: processingTime,
        mips: realMips,
        dataSize: data.length
    });
});

app.listen(3000, () => console.log('App running on port 3000'));