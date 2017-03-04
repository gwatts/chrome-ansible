function GitHubScan() {
  Blob.detect();
  Diff.detect();
}

// Github dynamically loads page fragments when switching between blobs instead of doing
// a full page load.  Make sure we catch those.
const observer = new MutationObserver(GitHubScan);

observer.observe($('#js-repo-pjax-container')[0], {
  childList: true,
  subtree: true,
});

// Do a scan on page load.
GitHubScan();
