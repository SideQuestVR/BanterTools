class Playlist {
  constructor() {
    this.hostUrl = 'vidya.sdq.st';
    this.currentScript = Array.from(document.getElementsByTagName('script')).slice(-1)[0];
    this.init();
  }
  async init() {
    await this.setupCoreScript();
    this.core = window.videoPlayerCore;
    this.core.parseParams(this.currentScript);
    this.setupPlaylistUI();
    await this.core.init(this.hostUrl);
    await this.core.setupCommandsScript();
    await this.core.setupWebsocket("playlist", d => this.parseMessage(d), () => {
      this.core.sendMessage({path: "instance", data: this.core.params.instance});
    }, ()=>{
        this.core.showToast("Reconnecting...");
    });
  }
  playPlaylist(shouldClear) {
    this.core.sendMessage({path: Commands.FROM_PLAYLIST, data: {id: this.playlistId || this.core.params.playlist, shouldClear, fromPlaylist: true}});
    this.playlistId = null;
  }
  clearPlaylist() {
    this.core.sendMessage({path: Commands.CLEAR_PLAYLIST});
  }
  parseMessage(msg) {
    const json = JSON.parse(msg);
    switch(json.path) {
      case Commands.SYNC_TIME:
        const currentTime = document.querySelector('.currentTime');
        if(currentTime != null) {
          currentTime.style.width = ((json.data.currentTime / json.data.duration) * 100) + "%";
        }
        const currentTimeText = document.querySelector('.currentTimeText');
        if(currentTimeText != null) {
          currentTimeText.innerText = this.timeCode(json.data.currentTime) + " / " + this.timeCode(json.data.duration);
        }
        break;
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
  setupCoreScript() {
    return new Promise(resolve => {
      let myScript = document.createElement("script");
      myScript.setAttribute("src", `https://${this.hostUrl}/core.js`);
      myScript.addEventListener ("load", resolve, false);
      document.body.appendChild(myScript);
    });
  }
  search(data) {
    this.core.sendMessage({path: Commands.SEARCH, data });
  }
  updatePlaylist(player) {
    const isMe = player.host.id === window.user.id;
    this.lockPlayer.innerText = player.locked ? 'Unlock' : 'Lock';
    this.lockPlayer.className = player.locked ? 'button teal' : 'button red';
    this.lockPlayer.style.display = !isMe ? 'none' : 'inline-block';
    this.clearPlaylistButton.style.display = !isMe ? 'none' :  'inline-block';
    this.addPlaylist.style.display = !isMe ? 'none' :  'inline-block';
    this.takeOver.style.display = (player.canTakeOver || isMe) ? 'inline-block' : 'none';
    this.takeOver.innerText = player.canTakeOver ? (isMe ? 'Take Over: On' : 'Take Over') : 'Take Over: Off';
    this.takeOver.className = player.canTakeOver ? (isMe ? 'button red' : 'button teal') : 'button teal';
    this.voting.style.display = !isMe ? 'none' : 'inline-block';
    this.voting.innerText = player.canVote ? 'Voting: On' : 'Voting: Off';
    this.hostTitle.innerHTML = 
      'Welcome ' + window.user.name + '.' +
      (isMe ? 'You are' : player.host.name + ' is') +
      " the host" + 
      (player.canTakeOver ? " but it can be taken over ( click " + (isMe ? "again to disable" : "<span style=\"color: red;\">to take over ASAP!!!</span>") + " )!": "") +
      (player.locked && !player.canTakeOver ? " and it's locked!" : !player.canTakeOver ? "." : "");
    this.videoPlaylistContainer.innerHTML = '';
    player.playlist.sort((a, b) => b.votes - a.votes);
    player.playlist.forEach((v, i) => {
      const videoItemContainer = this.core.makeAndAddElement('div', {background: player.currentTrack === i ? '#4f4f4f' : i % 2 === 0 ? '#8f8f8f' : '#9f9f9f'}, this.videoPlaylistContainer);
      
      const videoThumbnail = this.core.makeAndAddElement('img',{height: '80px', width: '142px', float: 'left'}, videoItemContainer);
      
      const videoTitleAndAction = this.core.makeAndAddElement('div',{float: 'left', width: 'calc(100% - 180px)'}, videoItemContainer);
      
      const videoTitle = this.core.makeAndAddElement('div',{
        padding: '7 10 10 7', 
        textOverflow: 'ellipsis', 
        overflow: 'hidden', 
        whiteSpace: 'nowrap'
      }, videoTitleAndAction);
      
      videoThumbnail.src = v.thumbnail;
      
      videoTitle.innerHTML = (player.canVote && player.currentTrack !== i ? "<b>(" + player.playlist[i].votes + ")</b> " : "") + v.title;
        
      const videoAuthor = this.core.makeAndAddElement('div',{
        padding: '0 10 5 7', 
        textOverflow: 'ellipsis', 
        overflow: 'hidden', 
        fontSize: '0.8rem',
        color: '#cfcfcf',
        float: 'right',
        whiteSpace: 'nowrap'
      }, videoTitle);

      videoAuthor.className = "currentTimeAuthor";
      videoAuthor.innerText = "Added By: " + v.user;
      
      if(player.currentTrack !== i) {
        if(isMe || (!player.locked && !player.canVote)) {
          const playTrack = this.core.makeAndAddElement('div',null, videoTitleAndAction);

          playTrack.className = 'button slim green';
          playTrack.innerText = "Play Now";

          playTrack.addEventListener('click', () => {
            this.core.sendMessage({path: Commands.SET_TRACK, data: i });
          });          
        }
        if(player.canVote) {
          const voteDown = this.core.makeAndAddElement('div',null, videoTitleAndAction);

          voteDown.className = 'button slim teal';
          voteDown.innerText = "Down Vote";

          voteDown.addEventListener('click', () => {
            this.core.sendMessage({path: Commands.DOWN_VOTE, data: i  });
          });

          const voteUp = this.core.makeAndAddElement('div',null, videoTitleAndAction);
          voteUp.className = 'button slim teal';
          voteUp.innerText = "Up Vote";

          voteUp.addEventListener('click', () => {
            this.core.sendMessage({path: Commands.UP_VOTE, data: i });
          });
        }else{
          const moveDown = this.core.makeAndAddElement('div',null, videoTitleAndAction);

          moveDown.className = 'button slim teal';
          moveDown.innerText = "Move Down";

          moveDown.addEventListener('click', () => {
            this.core.sendMessage({path: Commands.MOVE_PLAYLIST_ITEM, data: {url: v.link , index: i + 1}  });
          });

          const moveUp = this.core.makeAndAddElement('div',null, videoTitleAndAction);
          moveUp.className = 'button slim teal';
          moveUp.innerText = "Move Up";

          moveUp.addEventListener('click', () => {
            this.core.sendMessage({path: Commands.MOVE_PLAYLIST_ITEM, data: {url: v.link , index: i - 1} });
          });
        }
        if(isMe || (!player.locked && !player.canVote)) {
          const remove = this.core.makeAndAddElement('div',null, videoTitleAndAction);

          remove.className = 'button slim red';
          remove.innerText = "Remove";

          remove.addEventListener('click', () => {
            this.core.sendMessage({path: Commands.REMOVE_PLAYLIST_ITEM, data: i });
          });         
        }
      }else{
        
        const currentTimeText = this.core.makeAndAddElement('div',{
          padding: '7 10 0 7', 
          textOverflow: 'ellipsis', 
          overflow: 'hidden', 
          whiteSpace: 'nowrap'
        }, videoTitleAndAction);
        
        currentTimeText.className = "currentTimeText";
        currentTimeText.innerText = this.timeCode(player.currentTime) + " / " + this.timeCode(player.duration);
      }
        
      this.core.makeAndAddElement('div',{clear: 'both'}, videoItemContainer);
      
      if(player.currentTrack === i) {
        const currentTime = this.core.makeAndAddElement('div', {
          height: '4px', 
          width: '100%',
        }, videoItemContainer);
        const currentTimeInner = this.core.makeAndAddElement('div', {
          height: '4px', 
          background: 'red',
          transition: 'width 1s',
          transitionTimingFunction: 'linear',
          width: ((player.currentTime / player.duration) * 100) + "%",
        }, currentTime);
        
        currentTimeInner.className = "currentTime";
      }
    })
  }
  timeCode(seconds) {
    return new Date(seconds * 1000).toISOString().substring(11, 19);
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
      
      const addToPlaylist = this.core.makeAndAddElement('div',null, videoTitleAndAction);
      
      addToPlaylist.className = 'button slim teal';
      addToPlaylist.innerText = "Add To Playlist";
      
      addToPlaylist.addEventListener('click', async () => {
        this.core.sendMessage({path: Commands.ADD_TO_PLAYLIST, data: v });
      }); 
      
      const playNow = this.core.makeAndAddElement('div',null, videoTitleAndAction);
      
      playNow.className = 'button slim teal';
      playNow.innerText = "Play Now";
      
      playNow.addEventListener('click', () => {
        this.hideSearch();
        this.core.sendMessage({path: Commands.ADD_TO_PLAYLIST, data: v, skipUpdate: true });
        this.core.sendMessage({path: Commands.SET_TRACK, data: this.core.player.playlist.length });
      }); 
      
      const playNext = this.core.makeAndAddElement('div',null, videoTitleAndAction);
      
      playNext.className = 'button slim teal';
      playNext.innerText = "Play Next";
      
      playNext.addEventListener('click', () => {
        this.core.sendMessage({path: Commands.ADD_TO_PLAYLIST, data: v, skipUpdate: true });
        this.core.sendMessage({path: Commands.MOVE_PLAYLIST_ITEM, data: {url: v.link , index: this.core.player.currentTrack + 1} });
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
  hideAddItem() {
      this.addItemContainer.style.display = 'none';
      this.addItemBackDrop.style.display = 'none';
  }
  autoSync() {
    
  }
  setupPlaylistUI() {
    
    this.searchInput = document.querySelector('.searchInput');
    this.searchInput.addEventListener('keyup', () => this.debounceSearch(this.searchInput.value))
    
    this.voting = document.querySelector('#voting');
    
    this.voting.addEventListener('click', () => this.core.sendMessage({path: Commands.TOGGLE_VOTE }));
    
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
    
    this.clearPlaylistButton = document.querySelector('#clearPlaylist');
    
    this.clearPlaylistButton.addEventListener('click', () => this.clearPlaylist());
    
    this.autoSync = document.querySelector('#autoSync');
    
    this.autoSyncEnabled = false;
    
    this.autoSync.addEventListener('click', () => {
      this.autoSyncEnabled = !this.autoSyncEnabled;
      this.autoSync.innerText = this.autoSyncEnabled ? "Auto Sync: On" : "Auto Sync: Off";
      this.core.sendMessage({ path: Commands.AUTO_SYNC, data: this.autoSyncEnabled});
    });
    
    this.addItemContainer = document.querySelector('.addItemContainer');
    
    this.addItemBackDrop = document.querySelector('.addItemBackDrop');
      
    this.addItemBackDrop.addEventListener('click', () => this.hideAddItem());
    
    this.addItemTitle = document.querySelector('.addItemTitle');
    
    this.addItemInput = document.querySelector('#addItemInput');
    
    this.addItemSubmit = document.querySelector('#addItemSubmit');
    
    this.addPlaylist = document.querySelector('#addPlaylist');
    
    this.addPlaylist.addEventListener('click', () => {
      this.addItemContainer.style.display = 'block';
      this.addItemBackDrop.style.display = 'block';
      if(this.addPlaylistHandler) {
        this.addItemSubmit.removeEventListener('click', this.addPlaylistHandler);
      }
      this.addPlaylistHandler = () => {
        this.playlistId = this.addItemInput.value;
        this.playPlaylist(true);
        this.hideAddItem();
      };
      this.addItemSubmit.addEventListener('click', this.addPlaylistHandler);
    });
    
    this.hostTitle = document.querySelector('.hostTitle');
  }
}
new Playlist();
