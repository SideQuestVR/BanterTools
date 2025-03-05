class KaraokePlayer {
  constructor() {
    this.hostUrl = 'vidya-player.glitch.me';
    this.currentScript = Array.from(document.getElementsByTagName('script')).slice(-1)[0];
    this.init();
  }
  async init() {
    await this.setupCoreScript();
    this.core = window.videoPlayerCore;
    this.core.isKaraoke = true;
    this.core.parseParams(this.currentScript);
    await this.core.init(this.hostUrl);
    await this.core.setupCommandsScript();
    await this.core.setupWebsocket("space", null, () => {
      this.core.sendMessage({path: "instance", data: this.core.params.instance, u: window.user});
    });
    this.core.sendMessage({path: "instance", data: this.core.params.instance, u: window.user});
    const url = `https://${this.hostUrl}/?youtube=${
    encodeURIComponent(this.core.params.youtube)
      }&start=0&playlist=${this.core.params.playlist
      }&mute=${this.core.params.mute
      }&volume=${this.core.tempVolume
      }&instance=${this.core.params.instance
      }&user=${window.user.id}-_-${encodeURIComponent(window.user.name)}`;
    this.core.setupBrowserElement(url);
    this.core.setupJoinLeaveButton();
    this.core.setupLatencyMeasure();
  }
  setupCoreScript() {
    return new Promise(resolve => {
      let myScript = document.createElement("script");
      myScript.setAttribute("src", `https://${this.hostUrl}/core.js`);
      myScript.addEventListener ("load", resolve, false);
      document.body.appendChild(myScript);
    });
  }
}
new KaraokePlayer();