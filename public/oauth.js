// OAuth redirect target. Hands the provider's response (URL fragment or
// query) to the app over a same-origin BroadcastChannel, wipes it from the
// address bar and history, and closes the window. No token is stored here.
;(function () {
  var raw = (location.hash || '').replace(/^#/, '') || (location.search || '').replace(/^\?/, '')
  try {
    history.replaceState(null, '', location.pathname)
  } catch (e) {}
  try {
    var ch = new BroadcastChannel('fusellm-oauth')
    ch.postMessage(raw)
    ch.close()
  } catch (e) {
    document.getElementById('msg').textContent = 'This browser cannot finish the sign-in. Please try another browser.'
    return
  }
  setTimeout(function () {
    window.close()
  }, 150)
})()
