
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const cors = require("cors");
const https = require('https');
const { createClient } = require('redis');


const app = express();
const privateKey = fs.readFileSync( '../LegacyVideoPlayer/ssl/sdq.st.key' );
const certificate = fs.readFileSync( '../LegacyVideoPlayer/ssl/sdq.st.cert' );

const server = https.createServer({key: privateKey,cert: certificate}, app);
app.use(cors());
app.use(bodyParser.raw({
    limit: '50mb'
}));

const db = createClient();
db.on('error', err => console.log('Redis Client Error', err));
db.connect();

app.get('/v1/chunk/:keys', async (req, res) => {
    const chunks = await db.mGet(
        req.params.keys.split(",").map((key) => `bant-craft:${key}`)
    );
    res.send(Buffer.concat(chunks.map((chunk) => Buffer.concat(Buffer.from(chunk.length), chunk))));
});

app.get('/v1/chunk/delete/:key', async (req, res) => {
    db.del(
        `bant-craft:${req.params.key}`
    );
    res.send("ok");
});


app.post('/v1/chunk/save/:key', async (req, res) => {
    db.set(
        `bant-craft:${req.params.key}`,
        req.body
    );
    res.send("ok");
});

server.listen(2053, function listening(){
    console.log("BantCraft started."); 
});