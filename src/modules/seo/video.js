
export function scriptVideoLazy() {
    return `
  function videoLazy() {
    var lazyVideos = document.querySelectorAll("video")

    if ("IntersectionObserver" in window) {
      var lazyVideoObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(video) {
          if (video.isIntersecting) {
            for (var source in video.target.children) {
              var videoSource = video.target.children[source];
              if (typeof videoSource.tagName === "string" && videoSource.tagName === "SOURCE") {
                videoSource.src = videoSource.dataset.src;
              }
            }

            video.target.load();
            lazyVideoObserver.unobserve(video.target);
          }
        });
      });

      lazyVideos.forEach(function(lazyVideo) {
        lazyVideoObserver.observe(lazyVideo);
      });
    }
  }
  if (document.readyState !== 'loading') {
    videoLazy();
  } else {
    document.addEventListener('DOMContentLoaded', videoLazy);
  }`;
}