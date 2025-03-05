if(window.isBanter) {
  const now = Date.now();
  window.userJoinedCallback = async user => {
    if(Date.now() - now > 30000) {
      const name = (user.name ? user.name : user.id.substr(0, 6));
      const welcome = await fetch('https://say-something.glitch.me/say/' + name + " has joined the space!");
      const url = await welcome.text();
      const audio = new Audio("data:audio/mpeg;base64," + url);
      audio.autoplay = true;
      audio.play();
      audio.volume = 0.08;
    }
  }
}