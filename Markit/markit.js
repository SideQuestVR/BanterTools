const { Client } = require('pg');
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
    const privateKey = null;
    const certificate = null;
     
    privateKey = fs.readFileSync( '../LegacyVideoPlayer/ssl/sdq.st.key' );
    certificate = fs.readFileSync( '../LegacyVideoPlayer/ssl/sdq.st.cert' );
    
    const server = https.createServer({key: privateKey,cert: certificate}, app);
    app.use(cors());

    // app.use(express.static(path.join(__dirname, '..', 'public')));

    server.listen( dohttp?80:443, function listening(){
        console.log("Video Player started."); 
    });
    
    try {
        const res = await db.query('SELECT $1::text as message', ['Hello world!'])
        console.log(res.rows[0].message) // Hello world!
    } catch (err) {
        console.error(err);
    } finally {
        await db.end()
    }
})();