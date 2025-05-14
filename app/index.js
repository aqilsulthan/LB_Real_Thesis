const express = require('express');
const app = express();

const loads = {
    a: 2000,  // Sesuai base load di load balancer
    b: 3000,
    c: 4000,
    d: 5000,
    e: 6000
};

app.get('/api/:endpoint', (req, res) => {
    const endpoint = req.params.endpoint;
    const load = loads[endpoint] || 2000;
    setTimeout(() => {
        res.json({ status: 'done', load });
    }, load);
});

app.listen(3000, () => console.log('App running on port 3000'));