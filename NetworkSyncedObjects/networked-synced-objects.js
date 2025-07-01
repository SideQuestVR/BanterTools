// const uWS = require('uWebSockets.js');

const dgram = require('dgram');
// const port = 2087;







const server = dgram.createSocket('udp4');

const PORT = 2087;
const HOST = '0.0.0.0';
const TIMEOUT_MS = 10000; // 10 seconds
const CHECK_INTERVAL = 5000; // check every 5 seconds


let clients = [];

server.on('listening', () => {
  const address = server.address();
  console.log(`UDP server listening on ${address.address}:${address.port}`);
});

server.on('message', (msg, rinfo) => {
  const message = msg.toString().trim();
  const {port, address} = rinfo;
  const clientId = `${address}:${port}`;
  let client = clients.filter(c => c.port === port && c.address === address)[0];
  if(!client) {
      client = {port, address, lastSeen: Date.now(), user: null, room: null};
      clients.push(client);
  }else{
      client.lastSeen = Date.now();
  }
  if (message !== 'ping') {
    gameServer.parseMessage(message, client);
  }
});

// Periodically check for disconnected clients
setInterval(() => {
  const now = Date.now();
  for (const {user, room, port, address, lastSeen} of clients) {
    if (now - lastSeen > TIMEOUT_MS) {
      console.log(`Client ${port, address} timed out`);
      clients = clients.filter(c => !(c.port === port && c.address === address));
      if(user && room) {
          console.log("user:", "@" + user, "disconnected from room", "#" + room);
          let _room = gameServer.getOrCreateRoom(room);
          gameServer.cleanRoom(_room);
      }
    }
  }
}, CHECK_INTERVAL);

server.bind(PORT, HOST);


const syncTypes = [
  "v3", // Vector3
  "v4", // Vector4
  "#" // number
]
 
class GameServer{
  constructor() {
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
    this.send(ws, {path, data});
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
    let created = 0;
    json.data.forEach(d => {
        const d2p = room.properties[d.id];
        if(d2p) {
          if(ownershipCallback) {
            
            // Handle changing ownership before the values are 
            // updated to allow the ownership check to pass.
            ownershipCallback(d2p, d.id);
          }
          if(d2p.o === ws.user) {
             
             // This user owns this property, let's update!
            d2p.v = d.v; 
            // Mark this object as needsUpdate
            d2p.up = true; 
          }else{
            
            // This user cannot update this object.
            this.notTheOwner(ws, d.id, d2p.o);
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
            created++;
          }else{ 
            
            // The type is not recognised, do nothing!
            return this.wrongType(ws);
          }
        }
    });
    if(created > 0) {
      console.log("created",created,"objects owned by", ws.user, "in room", ws.room);
    }
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
          this.assignNewOwner(room, ws, room.sockets.filter(_ws => _ws != ws));
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
          if(!room.sockets.includes(ws)) {
            room.sockets.push(ws);
            const total = this.flushRoomToUser(room, ws);
            console.log("user:", "@" + json.user, "joined room","#" + json.room , "with", total, "properties");
          }
        }
        break;
        
      // // The client can set the speed at shich the netowrk updates.
      // case "set-tick-interval":
      //   this.interval = json.data;
      //   break;
        
      // This is the most common path, update properties you own if they have changed
      case "tick":
        // console.log("tick", json.data.length, "properties from", ws.user, "in room", ws.room);
        json.data.forEach(d => {
          const d2 = d.id;
          if(d2 === "WssE-T5HqkCx4tKLHWvdWg.position") {
            // console.log("tick-recieved", d.o);
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
        // console.log("trying ownership", ws.user);
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
      clients.forEach(_ws => {
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
          this.assignNewOwner(room, ws, newOwner, p => removeObjs.push(p.split(".")[0]));
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
  assignNewOwner(room, ws, newOwner, deleteCallback) {
    Object.keys(room.properties).forEach(p => {
      if(room.properties[p].o === ws.user) {
        if(room.properties[p].ch && newOwner.length) {
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
  send(ws, data) {
    const response = Buffer.from(JSON.stringify(data));
    server.send(response, 0, response.length, ws.port, ws.address, (err) => {
      if (err) {
        console.error(`Error sending response to ${ws.port}:${ws.address}`, err);
      }
    });
  }
  broadcastToRoom(room, data) {
    clients.forEach((ws) => {
      if(ws.room === room.id) {
        this.send(ws, data);
      }
    });
  }
  flushRoomToUser(room, ws) {
    const props = Object.keys(room.properties);
    this.send(ws, JSON.stringify({path: "tick", data: props.map(d2 => {
      const d2p = room.properties[d2];
      return {v: d2p.v, o: d2p.o, t: d2p.t, ch: d2p.ch, id: d2};
    })}));
    return props.length;
  }
  tick() {
    this.tickCount++;

    // Look for properties that nee dto be updated, and prepare them to be sent to all clients.
    Object.values(this.rooms).forEach(room => {
      const propertiesToSync = [];
      let shouldSync = false;

      Object.keys(room.properties).forEach(d2 => {
        const d2p = room.properties[d2];
        if(d2p.up) {
          var prop = {v: d2p.v, o: d2p.o, t: d2p.t, ch: d2p.ch, id: d2};
          propertiesToSync.push(prop);
          d2p.up = false;
          shouldSync = true;
        }
      });
      if(shouldSync) { 
        
        if(this.tickCount > 40) {
          // console.log("room", room.id, "sockets", room.sockets.length, "props", Object.keys(room.properties).length, "socketstotal", Object.values(clients).length, "shouldSync", shouldSync);
          this.tickCount = 0;
            // this.broadcastToRoom(room, {path: "test", data: {test: "test"}}); 
        }
        // If any properties need to be updates, send them. 
        this.broadcastToRoom(room, {path: "tick", data: propertiesToSync});  
      }
    }); 
  } 
}    

const gameServer = new GameServer();
