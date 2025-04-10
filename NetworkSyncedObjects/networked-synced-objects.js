const uWS = require('uWebSockets.js');
const port = 2087;
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



const syncTypes = [
  "v3", // Vector3
  "v4", // Vector4
  "#" // number
]
 
class GameServer{
  constructor() {
    // this.setupServer();
    this.interval = 50;
    this.rooms = {};
    this.tickWrapper();
    this.hasTransferredOwner = false;
    this.tickCount = 0;
  }
  averageTimeDifference(timestamps) {
    if (timestamps.length < 2) {
        return 0;  // No time difference to calculate if there are fewer than 2 timestamps
    }

    let totalDifference = 0;
    for (let i = 1; i < timestamps.length; i++) {
        totalDifference += timestamps[i - 1] - timestamps[i];
    }

    return totalDifference / (timestamps.length - 1)
  }
  errorResponse(ws, path, data) {
    ws.send(JSON.stringify({path, data}));
  }
  wrongType(ws, id) {
    this.errorResponse(ws,'wrong-type', id); 
  }
  notTheOwner(ws, id, o) {
    this.errorResponse(ws,'not-owned', {id, o});
  }
  toggleTakeOwnership(json, ws) {
    let room = this.getOrCreateRoom(ws.room);
    json.data.forEach(d => {
        Object.keys(room.properties).forEach(d2 => {
          if(d2 === d.id) {
            const d2p = room.properties[d2];
            if(d2p.o === ws.user) {
              d2p.ch = json.enable;
            }else{
              this.notTheOwner(ws, d2, d2p.o);
            } 
          }
        });
    });
  }
  updateValue(json, ws, ownershipCallback) {
    if(!ws.room || !ws.user)
      return;
    let room = this.getOrCreateRoom(ws.room);
    // Recieve updates from connected clients for objecst they own. 
    json.data.forEach(d => {
        const d2p = room.properties[d.id];
        if(d2p) {
          if(ownershipCallback) {
            
            // Handle changing ownership before the values are 
            // updated to allow the ownership check to pass.
            ownershipCallback(d2p, d2);
          }
          if(d2p.o === ws.user) {
             
             // This user owns this property, let's update!
            d2p.v = d.v; 
            // Mark this object as needsUpdate
            d2p.up = true; 
          }else{
            
            // This user cannot update this object.
            this.notTheOwner(ws, d2, d2p.o);
          }
        } else {
          if(syncTypes.includes(d.t)) {
            room.properties[d.id] = {
              v: d.v, // value
              o: ws.user, // owner
              t: d.t, // type: v3, v4, # 
              ch: d.ch, // canChangeOwner
              up: true // needsUpdate
            };
            console.log("created object", "#"+ d.id,"owned by", "@" + ws.user);
          }else{ 
            
            // The type is not recognised, do nothing!
            return this.wrongType(ws);
          }
        }
    });
  }
  getOrCreateRoom(name) {
    if(this.rooms[name]) {
      return this.rooms[name];
    }else{
      let room =  {
        id: name,
        sockets: [],
        properties: {

          // All properties are stored as a key value pair using the object id and the path to the property as the key
          // v = value t = type, o = owner and ch = changable owner

          // Examples: 
          // "hjfjhfh.position.x": {v: 1.345646, t: '#', o: "ajgagf", ch: true},
          // "object.rotation.y": {v: 1.345646, t: '#', o: "ajgagf", ch: false},
          // "object.scale.z": {v: 1.345646, t: '#', o: "ajgagf", ch: false},
          // "camera.fov": {v: [1.2324,1.2324,1.2324,2.344], t: 'v4', o: "ajgagf", ch: false},

        }
      };
      this.rooms[name] = room;
      return room;
    }
  }
  parseMessage(msg, ws) { 
    let json = JSON.parse(msg);
    
    switch(json.path) {
        
      // RPC One shot events.
      case "one-shot":
        let room = this.getOrCreateRoom(ws);
        if(ws.user) {
          json.from = ws.user;
          this.broadcastToRoom(room, json);
        } else {
          this.errorResponse(ws,'user-missing');
        }
        break;
      
      // Initial user connection
      case "leave": {
          if(!ws.room || !ws.user) {
            
            return;
          }
          let room = this.getOrCreateRoom(ws.room);
          
          room.sockets = room.sockets.filter(_ws => _ws !== ws);
          console.log("user:", "@" + ws.user, "left room", "#" + ws.room);
          ws.room = null;
          ws.user = null;
          assignNewOwner(room, ws);
        }
        break;
      case "join": {
          if(!json.room || !json.user) {
            return;
          }
          // Save the user on the websocket object, not ideal but works for now.
          ws.user = json.user;
          ws.room = json.room;
          let room = this.getOrCreateRoom(ws.room);
          room.sockets.push(ws);
          console.log("user:", "@" + json.user, "joined room","#" + json.room);
        }
        break;
        
      // // The client can set the speed at shich the netowrk updates.
      // case "set-tick-interval":
      //   this.interval = json.data;
      //   break;
        
      // This is the most common path, update properties you own if they have changed
      case "tick":
        json.data.forEach(d => {
          const d2 = d.id;
          if(d2 === "WssE-T5HqkCx4tKLHWvdWg.position") {
            console.log("tick-recieved", d.o);
          }
        });
        this.updateValue(json, ws);
        break;
        
      // Update properties you want to take over. 
      case "destroy":{
        
        // Look for objects that the user owns to remove.
        let remove = []; 
        
        let room = this.getOrCreateRoom(ws.room);
        Object.keys(json.data).forEach(p => {
          if(room.properties[p] && room.properties[p].o === ws.user) {
            delete room.properties[p];
            remove.push(p.split(".")[0]);
          }
        });
       
        // Get a unique list of object ids from the properties list.
        remove = remove.filter((value, index, self) => self.indexOf(value) === index);
    
        // Send to all clients to remove the objects.
        this.broadcastToRoom(room, {remove});
      }
        break;
      case "toggle-take-ownership":
        this.toggleTakeOwnership(json, ws);
        break;
      // Update properties you want to take over.
      case "take-ownership":
        console.log("trying ownership of", d2, "from", d2p.o, "to", ws.user);
        this.updateValue(json, ws, (d2p, d2) => { 
          if(d2p.ch) {
            console.log("taking ownership of", d2, "from", d2p.o, "to", ws.user);
            d2p.o = ws.user;
            d2p.up = true;
          }
        });
        
        // After you take ownership, force an update to the clients.
        // this.tick();
        break;
    }
  }
  cleanRoom(room) {
    // Clean up disconected websockets from the room.
    let removeObjs = [];
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
        let newOwner = room.sockets.filter(_ws => _ws != ws);
        if(!newOwner.length) {
          shouldDeleteRoom = true;
        }else{
          assignNewOwner(room, ws, p => removeObjs.push(p.split(".")[0]));
        }
      }
    });
    if(shouldDeleteRoom) {
      console.log("room empty, killing: " + room.id);
      delete this.rooms[room.id];
    }else{
      room.sockets = room.sockets.filter(ws => !removeSockets.includes(ws));
      removeObjs = removeObjs.filter((value, index, self) => self.indexOf(value) === index);
      if(removeObjs.length) {
        this.broadcastToRoom(room, JSON.stringify({remove: removeObjs}));
      }
    }
  }
  assignNewOwner(room, ws, deleteCallback) {
    Object.keys(room.properties).forEach(p => {
      if(room.properties[p].o === ws.user) {
        if(room.properties[p].ch && newOwner.length) {
          if(p === "WssE-T5HqkCx4tKLHWvdWg.position") {
            console.log("owner changed as user left", room.properties[p].o, newOwner[0].user);
          }
          room.properties[p].o = newOwner[0].user;
        }else{
          delete room.properties[p];
          if(deleteCallback) {
            deleteCallback(p);
          }
        }
      }
    });
  }
  tickWrapper() {
     
    // Calling the server tick at the specified interval.
    this.tick();
    setTimeout(() => this.tickWrapper(), this.interval);
  }
  broadcastToRoom(room, data) {
    wssClients.forEach((ws) => {
      if(ws.room === room.id) {
        ws.send(JSON.stringify(data)); // {data: propertiesToSync}
      }
    });
  }
  tick() {
    this.tickCount++;

    // Look for properties that nee dto be updated, and prepare them to be sent to all clients.
    Object.values(this.rooms).forEach(room => {
      const propertiesToSync = [];
      let shouldSync = false;

      Object.keys(room.properties).forEach(d2 => {
        const d2p = room.properties[d2];
        if(d2 === "WssE-T5HqkCx4tKLHWvdWg.position") {
          if(this.lastOwner !== d2p.o) {
            console.log("owner changed in tick", this.lastOwner, d2p.o);
          }
          this.lastOwner = d2p.o;
        }
        if(d2p.up) {
          var prop = {v: d2p.v, o: d2p.o, t: d2p.t, ch: d2p.ch, id: d2};
          propertiesToSync.push(prop);
          d2p.up = false;
          shouldSync = true;
        }
      });
      
      if(shouldSync) { 
        if(this.tickCount > 40) {
          // console.log("room", room.id, "sockets", room.sockets.length, "props", Object.keys(room.properties).length, "socketstotal", wssClients.length, "shouldSync", shouldSync);
          this.tickCount = 0;
        }
        // If any properties need to be updates, send them. 
        this.broadcastToRoom(room, {path: "tick", data: propertiesToSync});  
      }
    }); 
  } 
}    

const gameServer = new GameServer();
