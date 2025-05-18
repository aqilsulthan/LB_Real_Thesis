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

    res.json({
        status: 'done',
        load: processingTime,
        dataSize: data.length
    });
});

app.listen(3000, () => console.log('App running on port 3000'));