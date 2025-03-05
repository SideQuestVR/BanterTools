class Player {
  constructor(){
    this.hostUrl = 'vidya-player.glitch.me';
    this.currentScript = Array.from(document.getElementsByTagName('script')).slice(-1)[0];
    this.init();
  }
  async init() {
     await this.setupBrowserMessaging();
     this.currentTime = 0;
     await this.setupCoreScript();
     this.core = window.videoPlayerCore;
     this.core.parseParams(this.currentScript);
     await this.core.init(this.hostUrl);
     await this.core.setupCommandsScript();
     await this.core.setupWebsocket("player", () => this.parseMessage(event.data), () => {
       this.setupYoutubeScript();
       this.core.sendMessage({path: "instance", data: this.core.params.instance, u: window.user});
       this.core.sendMessage({path: "user-video-player", data: window.user});
     }, ()=>{
        this.core.showToast("Reconnecting...");
     });
     this.core.setupLatencyMeasure();
     this.playPlaylist();
     window.seek = this.seek.bind(this);
  }
  setupBrowserMessaging() {
     window.addEventListener("bantermessage", (e) => this.parseMessage(e.detail.message));
  }
  sendBrowserMessage(msg) {
    if (!window.bantermessage) {
      console.log("No banter message, is this banter?");
    } else {
      window.bantermessage(JSON.stringify(msg));
    }
  }
  waitFor(seconds) {
    return new Promise(resolve => {
      setTimeout(() => resolve(), seconds * 1000);
    })
  }
  playPlaylist(shouldClear) {
    this.core.sendMessage({path: Commands.FROM_PLAYLIST, data: {id: this.core.params.playlist, shouldClear, fromPlayer: true}});
  }
  onYouTubeIframeAPIReady() {
    new YT.Player('player', {
      height: window.innerHeight,
      width: window.innerWidth,
      videoId: this.core.getId(decodeURIComponent(this.core.params.youtube)),
      playerVars: {
        'playsinline': 1,
        'autoplay': 1,
        'disablekb': 1,
        'controls': 0,
        'modestbranding': true,
        'cc_load_policy': 1,
        'cc_lang_pref': 'en',
        'iv_load_policy': 3,
        'origin': 'https://www.youtube.com',
        'start': this.start ? Number(this.start) : 0
      },
      events: {
        onStateChange: event => {
          if(event.data === YT.PlayerState.PLAYING) {
            this.readyToPlay = true;
          }else if(this.readyToPlay && event.data !== YT.PlayerState.PLAYING) {
            this.player.playVideo();
          }
        },
        onError: event => {
          console.log(event.data);
        },
        onApiChange: async event => {
        },
        onReady: async event => {
          this.player = event.target; 
          this.setVolume();
          this.setMute();
          // setTimeout(() => this.startPlayerOrNot(), 500);
        }
      }
    });
  }
  startPlayerOrNot() {
    if(this.player && !this.isPlayerStarted && this.core.connected() && !this.readyToPlay) {
      this.core.sendMessage({path: Commands.CLICK_BROWSER, data: {x: window.innerHeight / 2, y: window.innerWidth / 2}});
      this.isPlayerStarted = true;
    }
  }
  seek(time) {
    if(this.player) {
      const timeForward = this.player.getCurrentTime() + time;
      this.player.seekTo(timeForward);
      return "Seeking to: " + timeForward;
    }
  }
  parseMessage(msg) {
    const json = JSON.parse(msg);
    switch(json.path) {
      case Commands.SET_VOLUME:
        if(json.data >= 0 && json.data <= 100) {
          this.core.params.volume = Number(json.data);
          this.setVolume(json.type);
          this.setMute();
          this.sendBrowserMessage(json);
        }
        break;
      case Commands.SKIP_BACK:
        const time = this.player.getCurrentTime() - 0.5;
        this.player.seekTo(time);
        this.core.showToast("-0.5s");
        break;
      case Commands.SKIP_FORWARD:
        const timeForward = this.player.getCurrentTime() + 0.5;
        this.player.seekTo(timeForward);
        this.core.showToast("+0.5s");
        break;
      case Commands.AUTO_SYNC:
        this.autoSync = json.data;
        break;
      case Commands.PLAYBACK_UPDATE:
        this.playerData = json.data.video;
        if(json.data.type === "set-track" && this.readyToPlay) {
          this.playVidya(json.data.video.currentTrack, json.data.video.currentTime, true);
        }else if(json.data.type === "stop" && this.readyToPlay) {
          this.player.loadVideoById(this.core.getId("https://www.youtube.com/watch?v=L_LUpnjgPso"), 0);
        }
        break;
      case Commands.MUTE:
        this.core.params.mute = json.data;
        this.core.showToast(this.core.params.mute === true || this.core.params.mute === 'true' ? "mute" : "unmute");
        this.setMute();
        break;
      case Commands.MEASURE_LATENCY:
        if(this.core.measureLatencyResolve){
          this.core.measureLatencyResolve();
          this.core.measureLatencyResolve = null;
        }
        break;
      case Commands.SYNC_TIME:
        this.currentTime = json.data.currentTime;
        if(this.player && this.readyToPlay) {
          const timediff = Math.abs(this.player.getCurrentTime() - (json.data.currentTime + this.core.currentLatency));
          document.getElementById('status').innerHTML = this.player.getCurrentTime() + " - " + (json.data.currentTime + this.core.currentLatency) + " = " + timediff;
          if(timediff > 0.5 && this.autoSync) {
             this.core.showToast("AutoSync: " + Math.round(timediff*100)/100 + "s");
             this.player.seekTo(json.data.currentTime + this.core.currentLatency);
          }
          this.core.params.volume = json.volume;
          this.playVidya(json.data.currentTrack, json.data.currentTime, false);
        }
        break;
    }
  }
  playVidya(currentTrack, currentTime, force, volume) {
    if(this.playerData) {
      if(this.lastUrl !== this.playerData.playlist[currentTrack].link || force) {
        const url = this.playerData.playlist[currentTrack].link;
        this.player.loadVideoById(this.core.getId(url), currentTime);
        this.player.playVideo();
        this.core.showToast("Playing: " + this.playerData.playlist[currentTrack].title);
        this.setVolume("spatial");
      }
      this.lastUrl = this.playerData.playlist[currentTrack].link;
    }else{
      console.log("No player data!");
    }
  }
  setMute() {
    if(this.core.params.mute === 'true' || this.core.params.volume === 0) {
      this.player.mute();
    }else{
      this.player.unMute();
    }
  }
  setVolume(type) {
    this.core.params.volume = Number(this.core.params.volume);
    if(this.player.getVolume() != this.core.params.volume) {
      this.player.setVolume(this.core.params.volume);
      const isSpatial = type === "spatial";
      const showToast = () => this.core.showToast((isSpatial ? "(spatial) " : "") + "vol: " + (this.core.params.volume) + "%");
      if(isSpatial) {
        clearTimeout(this.spatialUpdateTimeout);
        this.spatialUpdateTimeout = setTimeout(() => showToast(), 600);
      }else{
        showToast();
      }
    }
  }
  setupYoutubeScript() {
    return this.setupScript("https://www.youtube.com/iframe_api");
  }
  setupCoreScript() {
    return this.setupScript(`https://${this.hostUrl}/core.js`);
  }
  setupScript(script) {
    return new Promise(resolve => {
      let myScript = document.createElement("script");
      myScript.setAttribute("src", script);
      myScript.addEventListener ("load", resolve, false);
      document.body.appendChild(myScript);  
    });
  }
}
const player = new Player();
function onYouTubeIframeAPIReady() {
  player.onYouTubeIframeAPIReady();
}