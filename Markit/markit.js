const { Client } = require('pg');
(async()=>{

    const db = new Client()
    await db.connect()
    
    try {
        const res = await db.query('SELECT $1::text as message', ['Hello world!'])
        console.log(res.rows[0].message) // Hello world!
    } catch (err) {
        console.error(err);
    } finally {
        await client.end()
    }
})();