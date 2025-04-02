const { Client } = require('pg');
const express = require('express');
const bodyParser = require('body-parser');
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
    app.use(bodyParser.json({
        limit: '50mb'
    }))
    const getUsers = async (req, res) => {
        const users = await db.query('SELECT * FROM users WHERE ext_id = $1', [req.body.users_id]);
        if(users.rows.length == 0){
            res.status(404);
            res.send('{"error", "User not found"}');
            return null;
        }
        return users.rows[0];
    };
    const authUser = async (res, req) => {
        const userTest = await fetch("https://api.sidequestvr.com/v2/users/" + req.body.users_id + "/apps/me/achievements", {headers: {Authorization: `Bearer ${req.body.access_token}`}});
        if(userTest.status != 200){
            res.status(403);
            res.send('{"error", "Invalid access token"}');
            return false;
        }
        return true;
    }
    app.post('/kit/delete/:id', async (req, res) => {
        const user = await getUsers(req, res);
        if(!user) return;
        const kits = await db.query('SELECT id FROM kits WHERE id = $1', [req.params.id||0]);
        if(kits.rows.length > 0){
            if(!await authUser(res, req)) return;
            await db.query('UPDATE kits SET deleted = TRUE WHERE id = $1', [kits.rows[0].id]);
            res.send(JSON.stringify({deleted: kits.rows[0].id}));
        }else{
            res.send('{"error", "Kit not found"}');
        }
    });
    app.post('/kit', async (req, res) => {
        const user = await getUsers(req, res);
        if(!user) return;
        let rows = [];
        const kits = await db.query('SELECT id FROM kits WHERE id = $1', [req.body.id||0]);
        if(kits.rows.length > 0){
            if(!await authUser(res, req)) return;
            await db.query(`
                UPDATE kits 
                SET name = $1, 
                description = $2, 
                picture = $3, 
                android = $4, 
                windows = $5, 
                item_count = $6, 
                kit_categories_id = $7
                WHERE id = $8`, 
                [req.body.name, req.body.description, req.body.picture, req.body.android, req.body.windows, req.body.items.length, req.body.kit_categories_id, kits.rows[0].id]);
            await db.query('DELETE FROM kit_items WHERE kits_id = $1', [req.body.id]);
            rows = kits.rows;
            
        }else{
            const inserted = await db.query(`
                INSERT INTO kits 
                (users_id, name, description, picture, android, windows, item_count, kit_categories_id) 
                VALUES 
                ($1, $2, $3, $4, $5, $6, $7, $8) 
                RETURNING id`, 
                [users.rows[0].id, req.body.name, req.body.description, req.body.picture, req.body.android, req.body.windows, req.body.items.length, req.body.kit_categories_id]);
            
            rows = inserted.rows;
        }
        if(rows.length) {
            req.body.items.forEach(async (item) => {
                const res = await db.query(`
                    INSERT INTO kit_items
                    (kits_id, name, path, picture)
                    VALUES
                    ($1, $2, $3, $4) RETURNING id`, 
                    [rows[0].id, item.name, item.path, item.picture]);
            });
        }
    
        res.send(JSON.stringify({rows}));
    });

    app.get('/kit/categories', async (req, res) => {
        const { rows } = await db.query('SELECT * FROM kit_categories', []);
        res.send(JSON.stringify({rows}));
    });

    app.get('/kit/:id', async (req, res) => {
        const kits = await db.query('SELECT kits.id, kits.name, kits.description, kits.picture, kits.android, kits.windows, kits.item_count, kits.deleted, kits.created_at, kits.kit_categories_id, users.ext_id as users_id FROM kits LEFT JOIN users ON kits.users_id = users.id WHERE kits.id = $1', [req.params.id]);
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
        res.send(JSON.stringify({rows}));
    });

    app.post('/user', async (req, res) => {
        const { rows } = await db.query(`
            INSERT INTO users 
            (ext_id, name, profile_pic, color, bio) 
            VALUES 
            ($1, $2, $3, $4, $5) 
            RETURNING id`, 
            [req.body.ext_id, req.body.name, req.body.profile_pic, req.body.color, req.body.bio]);
        res.send(JSON.stringify({rows}));
    });

    app.get('/kits/user/:users_id', async (req, res) => {
        const { rows } = await db.query('SELECT kits.id, kits.name, kits.description, kits.picture, kits.android, kits.windows, kits.item_count, kits.deleted, kits.created_at, kits.kit_categories_id, users.ext_id as users_id FROM kits LEFT JOIN users ON kits.users_id = users.id WHERE deleted = FALSE AND users_id IN (SELECT id AS users_id FROM users where ext_id = $1)', [req.params.users_id]);
        res.send(JSON.stringify({rows}));
    });

    app.get('/kit/use/:id', async (req, res) => {
        await db.query('UPDATE kits SET use_count = use_count + 1 WHERE id = $1', [req.params.id]);
        res.send(JSON.stringify({}));
    });

    app.get('/kit/items/use/:id', async (req, res) => {
        await db.query('UPDATE kit_items SET use_count = use_count + 1 WHERE id = $1', [req.params.id]);
        res.send(JSON.stringify({}));
    });
    app.get('/kits/:page/:sort-:direction/:category?/:search?', async (req, res) => {
        const params = [req.params.page || 0, req.params.sort || 'use_count,name'];
        if(req.params.category && req.params.category !== "0") params.push(req.params.category);
        if(req.params.search) params.push("%" + req.params.search + "%");
        const { rows } = await db.query(
            'SELECT kits.id, kits.name, kits.description, kits.picture, kits.android, kits.windows, kits.item_count, kits.deleted, kits.created_at, kits.kit_categories_id, users.ext_id as users_id FROM kits LEFT JOIN users ON kits.users_id = users.id WHERE deleted = FALSE ' + 
            (req.params.category && req.params.category !== "0"? 'AND kits.kit_categories_id = $3 ' : '') + 
            (req.params.search ? 'AND (kits.name ILIKE $4 OR kits.description ILIKE $4) ' : '') + 
            'ORDER BY $2 ' + (req.params.direction == 'asc' ? 'ASC' : 'DESC') + ' OFFSET $1 LIMIT 10', 
            params );
        res.send(JSON.stringify({rows}));
    });

    server.listen(2096, function listening(){
        console.log("Markit started."); 
    });
})();