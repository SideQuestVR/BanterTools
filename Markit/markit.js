const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
(async()=>{
    const pass = fs.readFileSync(path.join(__dirname,'db.txt'), 'utf8');
    const db = new Client({
        user: 'postgres',
        password: pass.trim(),
        host: 'localhost',
        port: 5432,
        database: 'markit',
    })
    await db.connect()
    
    try {
        const res = await db.query('SELECT $1::text as message', ['Hello world!'])
        console.log(res.rows[0].message) // Hello world!
    } catch (err) {
        console.error(err);
    } finally {
        await db.end()
    }
})();