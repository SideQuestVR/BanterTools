//
// mediasoup_sample
//   https://github.com/mganeko/mediasoup_v3_example
//   mediasoup_v3_example is provided under MIT license
//
//   This sample is using https://github.com/versatica/mediasoup
//
//   Thanks To:
//     - https://lealog.hateblo.jp/entry/2019/03/25/180850
//     - https://lealog.hateblo.jp/entry/2019/02/25/144511
//     - https://github.com/leader22/mediasoup-demo-v3-simple/tree/master/server
//     - https://github.com/mkhahani/mediasoup-sample-app
//     - https://github.com/daily-co/mediasoup-sandbox
//
// install
//   npm install socket.io
//   npm install express
//   npm install socket.io
//   npm install mediasoup@3
//   npm install mediasoup-client@3
//   npm install browserify
// or
//   npm install
//
// setup
//   npm run build-client
//
// run
//   npm run broadcast

'use strict';

// --- read options ---
const fs = require('fs');
let serverOptions = {
  hostName: "screen.sdq.st",
  listenPort: 8443,
  useHttps: true,
  httpsKeyFile: "/usr/src/ssl/sdq.st.key",
  httpsCertFile: "/usr/src/ssl/sdq.st.cert"
};
let sslOptions = {};
if (serverOptions.useHttps) {
  sslOptions.key = fs.readFileSync(serverOptions.httpsKeyFile).toString();
  sslOptions.cert = fs.readFileSync(serverOptions.httpsCertFile).toString();
}

// --- prepare server ---
const http = require("http");
const https = require("https");
const express = require('express');

const app = express();
const webPort = serverOptions.listenPort;
app.use(express.static('public'));

let webServer = null;
if (serverOptions.useHttps) {
  // -- https ---
  webServer = https.createServer(sslOptions, app).listen(webPort, function () {
    console.log('Web server start. https://' + serverOptions.hostName + ':' + webServer.address().port + '/');
  });
}
else {
  // --- http ---
  webServer = http.Server(app).listen(webPort, function () {
    console.log('Web server start. http://' + serverOptions.hostName + ':' + webServer.address().port + '/');
  });
}

// --- file check ---
function isFileExist(path) {
  try {
    fs.accessSync(path, fs.constants.R_OK);
    //console.log('File Exist path=' + path);
    return true;
  }
  catch (err) {
    if (err.code === 'ENOENT') {
      //console.log('File NOT Exist path=' + path);
      return false
    }
  }

  console.error('MUST NOT come here');
  return false;
}

// --- socket.io server ---
const io = require('socket.io')(webServer);
console.log('socket.io server start. port=' + webServer.address().port);

io.on('connection', function (socket) {
  console.log('client connected. socket id=' + socket.id + '  , total clients=' + getClientCount());

  socket.on('disconnect', function () {
    // close user connection
    console.log('client disconnected. socket id=' + socket.id + '  , total clients=' + getClientCount());
    cleanUpPeer(socket);
  });

  socket.on('error', function (err) {
    console.error('socket ERROR:', err);
  });

  socket.on('connect_error', (err) => {
    console.error('client connection error', err);
  });

  socket.on('connectRoom', async (data, callback) => {
    const existRoom = Room.getRoom(data.room);
    if (existRoom) {
      console.log('--- use exist room. roomId=' + data.room);
      socket.room = data.room;
      socket.join(data.room);
      sendResponse(data, callback);
    } else {
      sendReject({ text: 'ERROR- Room does not exist!' }, callback);
    }
  });

  socket.on('createRoom', async (data, callback) => {
    const existRoom = Room.getRoom(data.room);
    if (existRoom) {
      console.log('--- use exist room. roomId=' + data.room);
      sendReject({ text: 'ERROR- Room already exists!' }, callback);
      return;
    } else {
      console.log('--- create new room. roomId=' + data.room);
      const room = new Room(data.room, socket.id);
      Room.addRoom(room, data.room);
      socket.join(data.room);
      socket.room = data.room;
      sendResponse(data, callback);
    }
  });

  socket.on('getRouterRtpCapabilities', (data, callback) => {
    const room = Room.getRoom(socket.room);
    if(notInRoom(socket, room, false, callback)) {
      return;
    }
    if (room.router) {
      sendResponse(room.router.rtpCapabilities, callback);
    }
    else {
      sendReject({ text: 'ERROR- router NOT READY' }, callback);
    }
  });

  // --- producer ----
  socket.on('createProducerTransport', async (data, callback) => {
    console.log('-- createProducerTransport ---');
    const room = Room.getRoom(socket.room);
    if(notInRoom(socket, room, true, callback)) {
      return;
    }
    const { transport, params } = await createTransport(room);
    room.producerTransport = transport;
    room.producerSocketId = socket.id;
    room.producerTransport.observer.on('close', () => {
      if (room.videoProducer) {
        room.videoProducer.close();
        room.videoProducer = null;
      }
      if (room.audioProducer) {
        room.audioProducer.close();
        room.audioProducer = null;
      }
      room.producerTransport = null;
    });
    sendResponse(params, callback);
  });

  socket.on('connectProducerTransport', async (data, callback) => {
    const room = Room.getRoom(socket.room);
    if(notInRoom(socket, room, true, callback)) {
      return;
    }
    await room.producerTransport.connect({ dtlsParameters: data.dtlsParameters });
    sendResponse({}, callback);
  });

  socket.on('produce', async (data, callback) => {
    const { kind, rtpParameters } = data;
    const room = Room.getRoom(socket.room);
    if(notInRoom(socket, room, true, callback)) {
      return;
    }
    console.log('-- produce --- kind=', kind);
    if (kind === 'video') {
      room.videoProducer = await room.producerTransport.produce({ kind, rtpParameters });
      room.videoProducer.observer.on('close', () => {
        console.log('videoProducer closed ---');
      })
      sendResponse({ id: room.videoProducer.id }, callback);
    } else if (kind === 'audio') {
      room.audioProducer = await room.producerTransport.produce({ kind, rtpParameters });
      room.audioProducer.observer.on('close', () => {
        console.log('audioProducer closed ---');
      })
      sendResponse({ id: room.audioProducer.id }, callback);
    }
    else {
      console.error('produce ERROR. BAD kind:', kind);
      return;
    }

    // inform clients about new producer
    console.log('--broadcast newProducer -- kind=', kind);
    socket.broadcast.to(room.name).emit('newProducer', { kind: kind });
  });

  // --- consumer ----
  socket.on('createConsumerTransport', async (data, callback) => {
    console.log('-- createConsumerTransport ---');
    const room = Room.getRoom(socket.room);
    if(notInRoom(socket, room, false, callback)) {
      return;
    }
    const { transport, params } = await createTransport(room);
    room.consumerTransports[socket.id] = transport;
    // addConsumerTrasport(getId(socket), transport);
    transport.observer.on('close', () => {
      console.log('--- consumerTransport closed. --')
      killConsumer(socket);
    });
    sendResponse(params, callback);
  });

  socket.on('connectConsumerTransport', async (data, callback) => {
    console.log('-- connectConsumerTransport ---');
    const room = Room.getRoom(socket.room);
    if(notInRoom(socket, room, false, callback)) {
      return;
    }
    let transport = room.consumerTransports[socket.id];
    if (!transport) {
      console.error('transport NOT EXIST for id=' + socket.id);
      sendResponse({}, callback);
      return;
    }
    await transport.connect({ dtlsParameters: data.dtlsParameters });
    sendResponse({}, callback);
  });

  socket.on('consume', async (data, callback) => {
    const kind = data.kind;
    console.log('-- consume --kind=' + kind);
    const room = Room.getRoom(socket.room);
    if(notInRoom(socket, room, false, callback)) {
      return;
    }

    let transport = room.consumerTransports[socket.id];
    if (!transport) {
      console.error('transport NOT EXIST for id=' + socket.id);
      return;
    }
    if (kind === 'video') {
      if (room.videoProducer) {
        const { consumer, params } = await createConsumer(transport, room.videoProducer, data.rtpCapabilities, room); 
        room.videoConsumers[socket.id] = consumer;
        consumer.observer.on('close', () => {
          console.log('consumer closed ---');
        })
        consumer.on('producerclose', () => {
          console.log('consumer -- on.producerclose');
          consumer.close();
          delete room.videoConsumers[socket.id];

          // -- notify to client ---
          socket.emit('producerClosed', { localId: socket.id, remoteId: room.producerSocketId, kind: 'video' });
        });

        console.log('-- consumer ready ---');
        sendResponse(params, callback);
      }
      else {
        console.log('-- consume, but video producer NOT READY');
        const params = { producerId: null, id: null, kind: 'video', rtpParameters: {} };
        sendResponse(params, callback);
      }
    }
    else if (kind === 'audio') {
      if (room.audioProducer) {
        const { consumer, params } = await createConsumer(transport, room.audioProducer, data.rtpCapabilities, room); 
        room.audioConsumers[socket.id] = consumer;
        consumer.observer.on('close', () => {
          console.log('consumer closed ---');
        })
        consumer.on('producerclose', () => {
          console.log('consumer -- on.producerclose');
          consumer.close();
          delete room.audioConsumers[socket.id];

          // -- notify to client ---
          socket.emit('producerClosed', { localId: socket.id, remoteId: room.producerSocketId, kind: 'audio' });
        });

        console.log('-- consumer ready ---');
        sendResponse(params, callback);
      }
      else {
        console.log('-- consume, but audio producer NOT READY');
        const params = { producerId: null, id: null, kind: 'audio', rtpParameters: {} };
        sendResponse(params, callback);
      }
    }
    else {
      console.error('ERROR: UNKNOWN kind=' + kind);
    }
  });

  socket.on('resume', async (data, callback) => {
    const kind = data.kind;
    console.log('-- resume -- kind=' + kind);
    const room = Room.getRoom(socket.room);
    if(notInRoom(socket, room, false, callback)) {
      return;
    }
    if (kind === 'video') {
      let consumer = room.videoConsumers[socket.id]
      if (!consumer) {
        console.error('consumer NOT EXIST for id=' + socket.id);
        sendResponse({}, callback);
        return;
      }
      await consumer.resume();
      sendResponse({}, callback);
    }
    else {
      console.warn('NO resume for audio');
    }
  });

  // ---- sendback welcome message with on connected ---
  sendback(socket, { type: 'welcome', id: socket.id });

  // --- send response to client ---
  function sendResponse(response, callback) {
    //console.log('sendResponse() callback:', callback);
    callback(null, response);
  }

  // --- send error to client ---
  

  function sendback(socket, message) {
    socket.emit('message', message);
  }
});



class Room{
  constructor(name, socketId) {
    this.name = name;
    this.producerSocketId = socketId;
    this.producerTransport;
    this.videoProducer;
    this.audioProducer;

    this.consumerTransports = {};
    this.videoConsumers = {};
    this.audioConsumers = {};
    this.createRouter();
  }

  async createRouter()  {
    const mediaCodecs = mediasoupOptions.router.mediaCodecs;
    this.router = await worker.createRouter({ mediaCodecs });
  }

  static addRoom(room, name) {
    Room.rooms[name] = room;
  }

  static getRoom(name) {
    return Room.rooms[name];
  }

  static removeRoom(name) {
    const room = Room.rooms[name];
    if(!room) {
      return;
    }
    if(room.videoProducer) {
      room.videoProducer.close();
    }
    if(room.audioProducer) {
      room.audioProducer.close();
    }
    if (room.producerTransport) {
      room.producerTransport.close();
    }
    removeAllConsumers(room);
    delete Room.rooms[name];
  }
}

Room.rooms = {};

function sendReject(error, callback) {
  callback(error.toString(), null);
}

function notInRoom(socket, room, isProducer, callback) {
  const notInRoom = !socket.room || !room || (isProducer && !(socket.id.toString() === room.producerSocketId.toString()));
  if(notInRoom) {
    sendReject({ text: 'ERROR- Not in a room!' }, callback);
  }
  return notInRoom;
}

function killConsumer(socket) {
  const room = Room.getRoom(socket.room);
  if(!room) {
    return;
  }
  let consumer = room.videoConsumers[socket.id];
  if (consumer) {
    consumer.close();
    delete room.videoConsumers[socket.id];
  }
  consumer = room.audioConsumers[socket.id];
  if (consumer) {
    consumer.close();
    delete room.audioConsumers[socket.id];
  }
  delete room.consumerTransports[socket.id];
}

// function getId(socket) {
//   return socket.id;
// }

function getClientCount() {
  // WARN: undocumented method to get clients number
  return io.eio.clientsCount;
}

function cleanUpPeer(socket) {
  const room = Room.getRoom(socket.room);
  if(!room) {
    return;
  }
  if(room.producerSocketId === socket.id) {
    Room.removeRoom(room.name);
  }else{
    killConsumer(socket);
  }
  socket.leave(socket.room);
}

// ========= mediasoup ===========
const mediasoup = require("mediasoup");
const mediasoupOptions = {
  // Worker settings
  worker: {
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
    logLevel: 'warn',
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
      // 'rtx',
      // 'bwe',
      // 'score',
      // 'simulcast',
      // 'svc'
    ],
  },
  // Router settings
  router: {
    mediaCodecs:
      [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters:
          {
            'x-google-start-bitrate': 1000
          }
        },
      ]
  },
  // WebRtcTransport settings
  webRtcTransport: {
    listenIps: [
      { ip: '54.37.244.240', announcedIp: null }
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    maxIncomingBitrate: 1500000,
    initialAvailableOutgoingBitrate: 1000000,
  }
};

let worker = null;

async function startWorker() {
  worker = await mediasoup.createWorker();
  console.log('-- mediasoup worker start. --')
}

startWorker();


function removeAllConsumers(room) {
  for (const key in room.videoConsumers) {
    killConsumer(key)
  }
  console.log('removeAllConsumers videoConsumers');
}

async function createTransport(room) {
  const transport = await room.router.createWebRtcTransport(mediasoupOptions.webRtcTransport);
  console.log('-- create transport id=' + transport.id);

  return {
    transport: transport,
    params: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    }
  };
}

async function createConsumer(transport, producer, rtpCapabilities, room) {
  let consumer = null;
  if (!room.router.canConsume(
    {
      producerId: producer.id,
      rtpCapabilities,
    })
  ) {
    console.error('can not consume');
    return;
  }

  //consumer = await producerTransport.consume({ // NG: try use same trasport as producer (for loopback)
  consumer = await transport.consume({ // OK
    producerId: producer.id,
    rtpCapabilities,
    paused: producer.kind === 'video',
  }).catch(err => {
    console.error('consume failed', err);
    return;
  });

  //if (consumer.type === 'simulcast') {
  //  await consumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 2 });
  //}

  return {
    consumer: consumer,
    params: {
      producerId: producer.id,
      id: consumer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused
    }
  };
}

