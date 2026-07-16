App({
  onLaunch() {
    // Install TextEncoder/TextDecoder before any picoo glue is required.
    try {
      require('./libs/picoo/text-encoding.js');
    } catch (_) {
      // sync:mp may not have run yet; the index page surfaces a clearer error.
    }
  },
});
