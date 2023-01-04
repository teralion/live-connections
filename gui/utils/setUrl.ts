function setUrl(url: string) {
  if (!url) {
    throw new Error(`[setUrl]: url arg is not defined: ${url}`);
  }

  window.history.pushState(
    {}, // non-used
    "", // legacy History API
    url
  )
}

export default setUrl;
