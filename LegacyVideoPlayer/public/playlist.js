class PlaylistPlayer {
  constructor() {
	console.log("constructor");
    this.hostUrl = 'vidya.sdq.st';
    this.currentScript = Array.from(document.getElementsByTagName('script')).slice(-1)[0];
    this.init();
  }
  async init() {
	console.log("before setup core");
    await this.setupCoreScript();
	console.log("setup core?");
    this.core = window.videoPlayerCore;
    this.core.parseParams(this.currentScript);
    // this.core.setupBrowserElement();
    await this.core.init(this.hostUrl);
    await this.core.setupCommandsScript();
    await this.core.setupWebsocket("space", null, () => {
      this.core.sendMessage({path: "instance", data: this.core.params.instance, u: window.user});
    });
    const url = `https://${this.hostUrl}/?youtube=${encodeURIComponent(this.core.params.youtube)}&start=0&playlist=${this.core.params.playlist}&mute=${this.core.params.mute}&volume=${this.core.tempVolume}&instance=${this.core.params.instance}&user=${window.user.id}-_-${window.user.name}`;
    this.core.setupBrowserElement(url);
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
new PlaylistPlayer();
