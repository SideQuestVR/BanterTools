
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const cors = require("cors");
const https = require('https');
const { createClient, commandOptions } = require('redis');


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
    const keys = req.params.keys.split(",").map((key) => `bant-craft:${key}`);
    const chunks = await db.mGet(commandOptions({ returnBuffers: true }), keys);
    function bufferFromInt(num){
        let buf = Buffer.allocUnsafe(4);  // Init buffer without writing all data to zeros
        buf.writeInt32LE(num); 
        return buf;
    }


    res.send(Buffer.concat(chunks.map((chunk) => chunk ? Buffer.concat([bufferFromInt(chunk.length), chunk]) : bufferFromInt(0))));
});

app.get('/v1/chunk/delete/:key', async (req, res) => {
    db.del(
        `bant-craft:${req.params.key}`
    );
    res.send("ok");
});


app.post('/v1/chunk/save/:key', async (req, res) => {
    console.log("body", req.body);
    db.set(
        `bant-craft:${req.params.key}`,
        req.body
    );
    res.send("ok");
});

server.listen(2053, function listening(){
    console.log("BantCraft started."); 
});