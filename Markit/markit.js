const { Client } = require('pg');
const express = require('express');
const bodyParser = require('body-parser')
const fs = require('fs');
const path = require('path');
const cors = require("cors");
const https = require('https');

(async()=>{
    const pass = fs.readFileSync(path.join(__dirname,'db.txt'), 'utf8');
    const db = new Client({
        user: 'postgres',
        password: pass.trim(),
        host: 'localhost',
        port: 5432,
        database: 'markit',
    })
    await db.connect();

    const app = express();
    const privateKey = fs.readFileSync( '../LegacyVideoPlayer/ssl/sdq.st.key' );
    const certificate = fs.readFileSync( '../LegacyVideoPlayer/ssl/sdq.st.cert' );
    
    const server = https.createServer({key: privateKey,cert: certificate}, app);
    app.use(cors());
    app.use(bodyParser.json())
    app.use(express.static(path.join(__dirname, 'public')));

    app.post('/kits', async (req, res) => {
        const { users } = await db.query('SELECT * FROM users WHERE ext_id = $1', [req.body.users_id]);
        if(users.length == 0){
            res.status(404);
            res.send('{"error", "User not found"}');
            return;
        }

        const { kits } = await db.query('INSERT INTO kits (users_id, name, description, picture, android, windows, item_count) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [users[0].id, req.body.name]);
        res.send('{"created": ' + kits[0] + '}');
    });

    app.get('/kits/:id', async (req, res) => {
        const { kits } = await db.query('SELECT * FROM kits WHERE id = $1', [req.params.id]);
        const kit = kits[0];
        if(kit) {
            const { users } = await db.query('SELECT * FROM users WHERE id = $1', [kit.users_id]);
            kit.user = users[0];
            const { kitItems } = await db.query('SELECT * FROM kit_items WHERE kits_id = $1', [req.params.id]);
            kit.items = kitItems;
            res.send(JSON.stringify(kit));
        }else{
            res.status(404);
            res.send('{"error", "Kit not found"}');
        }
    });

    app.get('/kits/:page/:sort', async (req, res) => {
        const { kits } = await db.query('SELECT * FROM kits ORDER BY $2 OFFSET $1 LIMIT 10', [req.params.page, req.params.sort]);
        res.send(kits);
    });

    server.listen(2096, function listening(){
        console.log("Markit started."); 
    });
})();