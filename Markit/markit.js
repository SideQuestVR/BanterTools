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

    app.post('/kits', async (req, res) => {
        const users = await db.query('SELECT * FROM users WHERE ext_id = $1', [req.body.users_id]);
        if(users.rows.length == 0){
            res.status(404);
            res.send('{"error", "User not found"}');
            return;
        }

        const { rows } = await db.query(`
            INSERT INTO kits 
            (users_id, name, description, picture, android, windows, item_count, kit_categories_id) 
            VALUES 
            ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING id`, 
            [users[0].id, req.body.name, req.body.description, req.body.picture, req.body.android, req.body.windows, req.body.item_count, req.body.kit_categories_id]);
        res.send('{"created": ' + rows[0] + '}');
    });

    app.get('/kit/categories', async (req, res) => {
        const { rows } = await db.query('SELECT * FROM kit_categories', []);
        res.send(rows);
    });

    app.get('/kit/:id', async (req, res) => {
        const kits = await db.query('SELECT * FROM kits WHERE id = $1', [req.params.id]);
        const kit = kits.rows[0];
        if(kit) {
            const users = await db.query('SELECT * FROM users WHERE id = $1', [kit.users_id]);
            kit.user = users.rows[0];
            const items = await db.query('SELECT * FROM kit_items WHERE kits_id = $1', [req.params.id]);
            kit.items = items.rows;
            res.send(kit);
        }else{
            res.status(404);
            res.send('{"error", "Kit not found"}');
        }
    });

    app.get('/user/:users_id', async (req, res) => {
        const { rows } = await db.query('SELECT * FROM users WHERE id IN (SELECT id FROM users where ext_id = $1) OR id::text = $1', [req.params.users_id]);
        res.send(rows);
    });
    app.get('/kits/user/:users_id', async (req, res) => {
        const { rows } = await db.query('SELECT * FROM kits WHERE users_id IN (SELECT id AS users_id FROM users where ext_id = $1)', [req.params.users_id]);
        res.send(rows);
    });
    app.get('/kit/use/:id', async (req, res) => {
        await db.query('UPDATE kits SET use_count = use_count + 1 WHERE id = $1', [req.params.id]);
        res.send({});
    });

    app.get('/kit/items/use/:id', async (req, res) => {
        await db.query('UPDATE kit_items SET use_count = use_count + 1 WHERE id = $1', [req.params.id]);
        res.send({});
    });

    app.get('/kits/:page/:sort-:direction/:category?/:search?', async (req, res) => {
        const params = [req.params.page || 0, req.params.sort || 'created_at'];
        if(req.params.category) params.push(req.params.category);
        if(req.params.search) params.push("%" + req.params.search + "%");
        const { rows } = await db.query(
            'SELECT * FROM kits WHERE TRUE ' + 
            (req.params.category ? 'AND kit_categories_id = $3 ' : '') + 
            (req.params.search ? 'AND (name ILIKE $4 OR description ILIKE $4) ' : '') + 
            'ORDER BY $2 ' + (req.params.direction == 'asc' ? 'ASC' : 'DESC') + ' OFFSET $1 LIMIT 10', 
            params );
        res.send(rows);
    });

    server.listen(2096, function listening(){
        console.log("Markit started."); 
    });
})();