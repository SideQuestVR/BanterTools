class Portals {
  constructor() {
    this.currentScript = Array.from(document.getElementsByTagName('script')).slice(-1)[0];
    this.urlParams = new URLSearchParams(window.location.search);
    this.init();
  }
  async init() {
    if(window.isBanter) {
      await window.AframeInjection.waitFor(window, 'AFRAME');
      // console.log(window.AFRAME.scenes, document.querySelector("a-scene"));
      // await window.AframeInjection.waitFor(window.AFRAME.scenes, 0);
      // console.log("here");
      this.sceneParent = document.querySelector("a-scene");
      this.parseParams();
      setInterval(() => this.tick(), 5 * 60 * 1000);
      this.tick();
    }
  }
  parseParams() {
    this.setOrDefault("space-limit", "5");
    this.setOrDefault("show-events", "true");
    this.setOrDefault("shape", "line");
    this.setOrDefault("spiral-tightness", "0.2");
    this.setOrDefault("spacing", "2");
    this.setOrDefault("offsets", "0");
    this.setOrDefault("scale-offsets", "1");
    this.setOrDefault("position", "0 0 0");
    this.setOrDefault("rotation", "0 0 0");
  } 
  setOrDefault(attr, defaultValue) {
    const value = this.currentScript.getAttribute(attr);
    this.params = this.params || {};
    this.params[attr] = value || (this.urlParams.has(attr) ? this.urlParams.get(attr) : defaultValue);
  }
  setupPortal(url, parent, isEvent) {
    const portal = document.createElement('a-link');
    // console.log("portal setAttribute", 'href', url);
    portal.setAttribute('href', url);
    let liveNow;
    if(isEvent) {
      liveNow = document.createElement('a-text');
      liveNow.setAttribute('value', 'Event Live Now!');
      liveNow.setAttribute('scale', '0.5 0.5 0.5');
      liveNow.setAttribute('align', 'center');
    }
    switch(this.params.shape) {
      case "line":
        const offsets = this.params.offsets.split(",");
        const scaleOffsets = this.params["scale-offsets"].split(",");
        if(offsets.length === Number(this.params["space-limit"])) {
          portal.setAttribute('position', offsets[this.portalCount] + ' 0 0');
          if(liveNow)liveNow.setAttribute('position', offsets[this.portalCount] + ' 0.1 0');
        }else{
          portal.setAttribute('position', (this.portalCount * this.params.spacing) + ' 0 0');
          if(liveNow)liveNow.setAttribute('position', (this.portalCount * this.params.spacing) + ' 0.1 0');
        }
        if(scaleOffsets.length === Number(this.params["space-limit"])) {
          portal.setAttribute('scale', scaleOffsets[this.portalCount] + ' ' + scaleOffsets[this.portalCount] + ' ' + scaleOffsets[this.portalCount]);
        }
        break;
      case "circle":
        const radius = (this.totalItems / (2 * Math.PI)) * this.params.spacing;
        const angle = (this.portalCount / this.totalItems) * 2 * Math.PI;
        const rotation = (angle * 180 / Math.PI); 
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);
        portal.setAttribute('position', `${x} 0 ${y}`);
        if(liveNow)liveNow.setAttribute('position', `${x} 0.1 ${y}`);
        portal.setAttribute('rotation', `0 ${-rotation - 90} 0`);
        break;
      case "spiral":
        const spiralRadius = this.distanceFromCenter;
        const spiralAngle = this.portalCount * this.params["spiral-tightness"] * Math.PI;
        const spiralRotation = (spiralAngle * 180 / Math.PI); 
        const spiralX = spiralRadius * Math.cos(spiralAngle);
        const spiralY = spiralRadius * Math.sin(spiralAngle);
        portal.setAttribute('position', `${spiralX} 0 ${spiralY}`);
        if(liveNow)liveNow.setAttribute('position', `${spiralX} 0.1 ${spiralY}`);
        portal.setAttribute('rotation', `0 ${-spiralRotation - 90} 0`);
        this.distanceFromCenter += this.params.spacing / Math.sqrt(1 + Math.pow(spiralAngle, 2));
        break;
    }
    this.portalCount++;
    // console.log("append portal");
    parent.appendChild(portal);
    if(liveNow) {
      parent.appendChild(liveNow);
    }
  }
  async tick() {
    let parent = document.querySelector('#portalParent');
    if(!parent) {
      parent = document.createElement('a-entity');
      parent.setAttribute('position', this.params.position);
      parent.setAttribute('rotation', this.params.rotation);
      this.sceneParent.appendChild(parent);
      parent.id = 'portalParent';
    }
    let spaces = await fetch('https://api.sidequestvr.com/v2/communities?is_verified=true&has_space=true&sortOn=user_count,name&descending=true,false&limit=' + this.params["space-limit"]).then(r=>r.json());
    let events = this.params['show-events'] === 'false' ?  [] : await fetch('https://api.sidequestvr.com/v2/events/banter').then(r=>r.json());
    events = (events || []).filter(e => {
      const start = new Date(e.scheduledStartTimestamp);
      const startTime = start.getTime();
      const isActive = startTime < Date.now();
      return isActive;
    });
    events.length = events.length < 5 ? events.length : 5;
    
    const eventLinks = events.map(e => e.location);
    spaces = spaces.filter(s=>eventLinks.indexOf(s.space_url)===-1&&eventLinks.indexOf(s.space_url+"/")===-1);
    this.totalItems = spaces.length - events.length;
    this.portalCount = 0;
    this.distanceFromCenter = 0;
    Array.from(parent.children).forEach(c => parent.removeChild(c));
    events.forEach(e => this.setupPortal(e.location, parent, true));
    spaces.forEach(e => this.setupPortal(e.space_url, parent));
  }
}
new Portals();