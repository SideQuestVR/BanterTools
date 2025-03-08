const uWS = require('uWebSockets.js');
const port = 2083;
let wssClients = [];
const app = uWS.SSLApp({
  key_file_name: './ssl.key',
  cert_file_name: './ssl.cert'
}).ws('/*', {
  maxPayloadLength: 512 * 1024,
  open: (ws) => {
    wssClients.push(ws);
    // console.log('A WebSocket connected!');
  },
  message: (ws, message, isBinary) => {
        try{
          gameServer.parseMessage(Buffer.from(message).toString(), ws);
        }catch(e) {
          console.log("parse error: ", e);
        }


/* Ok is false if backpressure was built up, wait for drain */


    //let ok = ws.send(message, isBinary);
  },
  drain: (ws) => {
    console.log('WebSocket backpressure: ' + ws.getBufferedAmount());
  },
  close: (ws, code, message) => {
    wssClients = wssClients.filter(_ws => _ws !== ws);
    if(ws.user && ws.room) {
        console.log("user:", "@" + ws.user, "disconnected from room", "#" + ws.room, "with code", code);
        let room = gameServer.getOrCreateRoom(ws.room);
        gameServer.cleanRoom(room);
    }
  },
  ping: async (ws) => {
   console.log("ping");
  },
  pong: async (ws) => {
   console.log("pong");
  }
}).any('/*', (res, req) => {
  res.end('Nothing to see here!');
}).listen(port, (token) => {
  if (token) {
    console.log('Listening to port ' + port);
  } else {
    console.log('Failed to listen to port ' + port);
  }
});


 
class LeaderBoardsServer{
  constructor() {
    this.rooms = {};
  }
  errorResponse(ws, path, data) {
    console.log("error: ", data);
    ws.send(JSON.stringify({path, data}));
  }
  getOrCreateRoom(name, ws) {
    if(!this.rooms[name]) {
      this.rooms[name] = {
        id: name,
        sockets: [ws],
        boards: {}
      };
    }else{
        if(!this.rooms[name].sockets.includes(ws)) {
            this.rooms[name].sockets.push(ws);
        }
    }
    return this.rooms[name];
  }
  parseMessage(msg, ws) { 
    try{
        // console.log(msg);
        let json = JSON.parse(msg);
        if(!json.room) {
            this.errorResponse(ws, "error", "missing required fields");
            return;
        }
        let room = this.getOrCreateRoom(json.room, ws);
        ws.room = json.room;
        if(json.path === "clear-board") {
            room.boards[json.board].scores.length = [];
            this.broadcastToRoom(room, {path: "update-scores", board: json.board, scores: room.boards[json.board]});
            return;
        }
        if(json.name && json.id && json.board && json.sort) {
            if(!room.boards[json.board]) {
                room.boards[json.board] = {
                    scores: [],
                    sort: json.sort,
                    board: json.board
                };
            }
            const score = room.boards[json.board].scores.find(score => score.id === json.id);
            if(score) {
                // need to only update the score if its higher/lower.
                if((score.score < json.score && json.sort === "asc") || (score.score > json.score && json.sort !== "asc")) {
                    score.score = json.score || 0;
                }
            }else{
                room.boards[json.board].scores.push({id: json.id, name: json.name, score: json.score || 0, color: json.color});
            }
            room.boards[json.board].scores.sort(room.boards[json.board].sort === "asc" ? (a, b) => a.score - b.score : (a, b) => b.score - a.score);
            
            this.broadcastToRoom(room, {path: "update-scores", board: json.board, scores: room.boards[json.board]});
        }else{
            Object.keys(room.boards).forEach(b => {
                const board = room.boards[b];
                // console.log({path: "update-scores", board: board.board, scores: board});
                ws.send(JSON.stringify({path: "update-scores", board: board.board, scores: board}));
            });
        }
    }catch(e) {
        this.errorResponse(ws, "error", e.message);
    }
  }
  cleanRoom(room) {
    // Clean up disconected websockets from the room.
    let removeSockets = [];
    let shouldDeleteRoom = false;
    room.sockets.forEach(ws=>{
      let isHere = false;
      wssClients.forEach(_ws => {
        if(_ws === ws) {
          isHere = true;
        }
      });
      if(!isHere) {
        removeSockets.push(ws);
        let socketsLeft = room.sockets.filter(_ws => _ws != ws);
        if(!socketsLeft.length) {
          shouldDeleteRoom = true;
        }
      }
    });
    if(shouldDeleteRoom) {
      console.log("room empty, should be killing: " + room.id);
    //   delete this.rooms[room.id];
    }else{
      room.sockets = room.sockets.filter(ws => !removeSockets.includes(ws));
    }
  }
  broadcastDebounceTimeouts = {};
  broadcastToRoom(room, data) {
    clearTimeout(this.broadcastDebounceTimeouts[room.id]);
    this.broadcastDebounceTimeouts[room.id] = setTimeout(()=>{
        wssClients.forEach((ws) => {
            if(ws.room === room.id) {
                ws.send(JSON.stringify(data));
            }
        });
        delete this.broadcastDebounceTimeouts[room.id];
        this.cleanRoom(room);
    }, 100);
  }
}    

const gameServer = new LeaderBoardsServer();
