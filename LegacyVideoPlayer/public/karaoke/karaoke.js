class Karaoke{
  constructor() {
    this.hostUrl = 'vidya.sdq.st';
    this.currentScript = Array.from(document.getElementsByTagName('script')).slice(-1)[0];
    this.init();
  }
  async init() {
    await this.setupCoreScript();
    this.core = window.videoPlayerCore;
    this.core.parseParams(this.currentScript);
    this.setupKaraokeUI();
    await this.core.init(this.hostUrl);
    await this.core.setupCommandsScript();
    await this.core.setupWebsocket("playlist", d => this.parseMessage(d), () => {
      this.core.sendMessage({path: "instance", data: this.core.params.instance});
    }, () => {
        this.core.showToast("Reconnecting...");
    });
    this.addYoutubeScript();
  }
  addYoutubeScript() {
    var tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    var firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  }
  setupKaraokeUI() {
    this.searchInput = document.querySelector('.searchInput');
    this.searchInput.addEventListener('keyup', () => this.debounceSearch(this.searchInput.value));
    
    this.autoSync = document.querySelector('#autoSync');
    
    this.autoSyncEnabled = false;
    
    this.autoSync.addEventListener('click', () => {
      this.autoSyncEnabled = !this.autoSyncEnabled;
      this.autoSync.innerText = this.autoSyncEnabled ? "Auto Sync: On" : "Auto Sync: Off";
      this.core.sendMessage({ path: Commands.AUTO_SYNC, data: this.autoSyncEnabled});
    });
    
    this.closePreview = document.querySelector('.closePreview');
    
    this.closePreview.addEventListener('click', () => {
      this.videoPreviewContainer.style.display = "none";
      this.YtPlayer.pauseVideo();
    });
    
    this.singIt = document.querySelector('#singIt');
    
    this.singIt.addEventListener('click', () => {
      this.core.sendMessage({ path: Commands.ADD_TO_PLAYERS, data: this.selectedVideo }); // : Commands.REMOVE_FROM_PLAYERS 
      this.YtPlayer.pauseVideo();
      this.videoPreviewContainer.style.display = "none";
      this.hideSearch();
    });
    
    const searchButtons = document.querySelectorAll(".searchButtons > .button");
    
    for (let i = 0; i < searchButtons.length; i++) {
       searchButtons[i].addEventListener("click", () => {
         this.searchInput.value += " " + searchButtons[i].innerText;
         this.debounceSearch(this.searchInput.value)
       });
    }
    
    this.videoPlayer = document.querySelector('#videoPlayer');
    
    this.videoPreviewContainer = document.querySelector('.videoPreviewContainer');
    
    this.videoPlaylistContainer = document.querySelector('.videoPlaylistContainer');
    
    this.searchBackDrop = document.querySelector('.searchBackDrop');
      
    this.searchBackDrop.addEventListener('click', () => this.hideSearch());
    
    this.videoSearchContainer = document.querySelector('.videoSearchContainer');
    
    this.loadingSpinner = document.querySelector('.loadingSpinner');
    
    this.lockPlayer = document.querySelector('#lockPlayer');
    
    this.lockPlayer.addEventListener('click', () => {
        this.core.sendMessage({ path: Commands.TOGGLE_LOCK, data: !this.core.player.locked });
    });
    
    this.takeOver = document.querySelector('#takeOver');
    
    this.takeOver.addEventListener('click', () => {
        if(this.core.player.host.id === window.user.id) {
          this.core.sendMessage({ path: Commands.TOGGLE_CAN_TAKE_OVER, data: !this.core.player.canTakeOver });
        }else{
          this.core.sendMessage({ path: Commands.TAKE_OVER });
        }
    });
    this.hostTitle = document.querySelector('.hostTitle');
  }
  setupCoreScript() {
    return new Promise(resolve => {
      let myScript = document.createElement("script");
      myScript.setAttribute("src", `https://${this.hostUrl}/core.js`);
      myScript.addEventListener ("load", resolve, false);
      document.body.appendChild(myScript);
    });
  }
  parseMessage(msg) {
    const json = JSON.parse(msg);
    switch(json.path) {
      case Commands.PLAYBACK_UPDATE:
        this.core.player = json.data.video;
        this.updatePlaylist(this.core.player);
        break;
      case Commands.SEARCH_RESULTS:
        this.loadVideos(json.data);
        break;
      case Commands.ERROR:
        alert("I cant let you do that...");
        break;
    }
  }
  search(data) {
    this.core.sendMessage({path: Commands.SEARCH, data });
  }
  updatePlaylist(player) {
    const isMe = player.host.id === window.user.id;
    this.lockPlayer.innerText = player.locked ? 'Unlock' : 'Lock';
    this.lockPlayer.className = player.locked ? 'button teal' : 'button red';
    this.lockPlayer.style.display = !isMe ? 'none' : 'inline-block';
    this.takeOver.style.display = (player.canTakeOver || isMe) ? 'inline-block' : 'none';
    const amIAPlayer = player.players.filter((p, i) => p.id === window.user.id).length > 0;
    this.takeOver.innerText = player.canTakeOver ? (isMe ? 'Take Over: On' : 'Take Over') : 'Take Over: Off';
    this.takeOver.className = player.canTakeOver ? (isMe ? 'button red' : 'button teal') : 'button teal';
    this.hostTitle.innerHTML = 
      'Welcome ' + window.user.name + '.' +
      (isMe ? 'You are' : player.host.name + ' is') +
      " the host" + 
      (player.canTakeOver ? " but it can be taken over ( click " + (isMe ? "again to disable" : "<span style=\"color: red;\">to take over ASAP!!!</span>") + " )!": "") +
      (player.locked && !player.canTakeOver ? " and it's locked!" : !player.canTakeOver ? "." : "");
    this.videoPlaylistContainer.innerHTML = player.players.length ? '' : '<h2 style="color: grey; margin-top: 100px; text-align: center;">No singers added yet!<br><br><div style="color: red;">DONT FORGET TO TAKE OVER THE KARAOKE PLAYER BEFORE YOU START!!<br>IF SOMEONE ELSE TOOK OVER, BAN THEM AND WAIT 45s THEN TAKE OVER</div></h2>';
    player.players.sort((a, b) => a.p - b.p);
    player.players.forEach((p, i) => {
      const videoItemContainer = this.core.makeAndAddElement('div', {background: player.currentTrack === i ? '#4f4f4f' : i % 2 === 0 ? '#8f8f8f' : '#9f9f9f'}, this.videoPlaylistContainer);
      const videoTitleAndAction = this.core.makeAndAddElement('div',{float: 'left', width: 'calc(100% - 180px)'}, videoItemContainer);
      
      const videoTitle = this.core.makeAndAddElement('div',{
        padding: '10 7 10 15', 
        textOverflow: 'ellipsis', 
        overflow: 'hidden', 
        whiteSpace: 'nowrap', 
        fontSize: '1.4em'
      }, videoTitleAndAction);
      
      videoTitle.innerHTML = `${(i+1)+"."} ${"<b>" + p.name + " </b>will sing<b> " + p.v.title + "</b>"} `;
      this.core.makeAndAddElement('div',{clear: 'both'}, videoItemContainer);
      if(p.id === window.user.id || isMe) {
        const buttons = this.core.makeAndAddElement('div',{marginTop: "10px"}, videoTitle);
        if(i == 0) {
          const preview = this.core.makeAndAddElement('div',null, buttons);
          preview.className = 'button slim teal';
          preview.innerText = "Play & Sing";
          preview.addEventListener('click', () => {
            if(this.core.player.locked) {
              this.core.showToast("Player is locked! The host needs to unlock it first!");
            }else{
              this.core.sendMessage({path: Commands.CLEAR_PLAYLIST, skipUpdate: true});
              this.core.sendMessage({path: Commands.ADD_TO_PLAYLIST, data: p.v, isYoutubeWebsite: false, skipUpdate: true });
              this.core.sendMessage({path: Commands.SET_TRACK, data: 0});
            }
          });
        }
       const remove = this.core.makeAndAddElement('div',null, buttons);
        remove.className = 'button slim red extra-margin-left';
        remove.innerText = "Remove Me";
        remove.addEventListener('click', () => {
          this.core.sendMessage({path: Commands.REMOVE_FROM_PLAYERS, data: p.id });
          if(i == 0) {
            this.core.sendMessage({path: Commands.CLEAR_PLAYLIST, skipUpdate: true});
            this.core.sendMessage({path: Commands.STOP});
          }
        });
      }
    });
  }
  loadVideos(videos) {
    this.videoSearchContainer.innerHTML = '';
    this.loadingSpinner.style.display = 'none';
    videos.forEach((v, i) => {
      const videoItemContainer = this.core.makeAndAddElement('div', {background: i % 2 === 0 ? '#8f8f8f' : '#9f9f9f'}, this.videoSearchContainer);
      
      const videoThumbnail = this.core.makeAndAddElement('img',{height: '80px', width: '142px', float: 'left'}, videoItemContainer);
      
      const videoTitleAndAction = this.core.makeAndAddElement('div',{float: 'left', width: 'calc(100% - 180px)'}, videoItemContainer);
      
      const videoTitle = this.core.makeAndAddElement('div',{
        padding: '7 10', 
        textOverflow: 'ellipsis', 
        overflow: 'hidden', 
        whiteSpace: 'nowrap'
      }, videoTitleAndAction);
      
      const preview = this.core.makeAndAddElement('div',null, videoTitleAndAction);
      
      preview.className = 'button slim teal';
      preview.innerText = "Preview & Sing It";
      
      preview.addEventListener('click', () => {
        this.selectedVideo = v;
        this.videoPreviewContainer.style.display = "block";
        this.YtPlayer.loadVideoById(this.core.getId(v.link), 0);
      });
      
      this.core.makeAndAddElement('div',{clear: 'both'}, videoItemContainer);
      
      videoThumbnail.src = v.thumbnail;
        
      videoTitle.innerText = v.title;
      
    })
  }
  debounceSearch(searchVal) {
    if(searchVal.length > 1) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => this.search(searchVal), 500);
      this.videoSearchContainer.style.display = 'block';
      this.searchBackDrop.style.display = 'block';
      this.loadingSpinner.style.display = 'block';
    }else{
      this.hideSearch();
    }
  }
  hideSearch() {
    this.videoSearchContainer.style.display = 'none';
    this.videoSearchContainer.innerHTML = '';
    this.searchBackDrop.style.display = 'none';
  }
  setupYoutubePlayer() {
    const youtubeUrl = 'https://www.youtube.com/watch?v=L_LUpnjgPso';
    new YT.Player('player', {
      height: '100%',
      width: '100%',
      videoId: this.core.getYTId(decodeURIComponent(youtubeUrl)),
      playerVars: {
        'playsinline': 1,
        'mute': 1,
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
        'onReady': (event) => {
          this.YtPlayer = event.target;
          this.YtPlayer.setVolume(0);
        }
      }
    });
  }
}
const karaoke = new Karaoke();

function onYouTubeIframeAPIReady() {
  karaoke.setupYoutubePlayer();
}
