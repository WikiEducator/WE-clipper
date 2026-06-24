const WIKI_API = 'https://wikieducator.org/api.php';
let pageContext = { title: '', url: '' };
let currentUsername = '';

document.addEventListener('DOMContentLoaded', async () => {
  const statusDiv = document.getElementById('status');
  const clipBtn = document.getElementById('clipBtn');
  const targetPageInput = document.getElementById('targetPage');
  const targetLabel = document.getElementById('targetLabel');

  const storedData = await chrome.storage.local.get('lastSubpage');
  if (storedData.lastSubpage) {
    targetPageInput.value = storedData.lastSubpage;
  }

  statusDiv.textContent = 'Verifying WikiEducator session...';

  // Re-enable button if the user edits the target page name
  targetPageInput.addEventListener('input', () => {
    if (targetPageInput.value.trim() && clipBtn.disabled && currentUsername) {
      clipBtn.disabled = false;
      statusDiv.textContent = '';
    }
  });

  try {
    const userRes = await fetch(`${WIKI_API}?action=query&meta=userinfo&format=json`, { credentials: 'include' });
    const userData = await userRes.json();
    const user = userData.query.userinfo;

    if (user.anon !== undefined || user.id === 0) {
      statusDiv.textContent = '';

      const errorSpan = document.createElement('span');
      errorSpan.style.color = 'red';
      errorSpan.textContent = 'Not logged into WikiEducator.';
      statusDiv.appendChild(errorSpan);
    
      statusDiv.appendChild(document.createElement('br'));
    
      const loginLink = document.createElement('a');
      loginLink.href = 'https://WikiEducator.org/Special:UserLogin';
      loginLink.target = '_blank';
      loginLink.style.color = '#36c';
      loginLink.textContent = 'Click here to log in';
      statusDiv.appendChild(loginLink); 
      return; 
    } else {
      currentUsername = user.name;
      targetLabel.textContent = `Destination: https://wikieducator.org/User:${currentUsername}/`;
      
      targetPageInput.disabled = false;
      clipBtn.disabled = false;
      statusDiv.textContent = ''; 
    }
  } catch (err) {
    statusDiv.textContent = 'Session error: ' + err.message;
    return;
  }

  // Scrape content metadata from the active browser page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      let selectedText = window.getSelection().toString().trim();
      if (!selectedText) {
        selectedText = document.querySelector('p') ? document.querySelector('p').innerText.trim() : '';
      }
      if (selectedText.length > 500) {
        selectedText = selectedText.substring(0, 500) + '...';
      }
      return { title: document.title, url: window.location.href, summary: selectedText };
    }
  }, (results) => {
    if (results && results[0]) {
      const { title, url, summary } = results[0].result;
      pageContext.title = title;
      pageContext.url = url;
      document.getElementById('description').value = summary;
    }
  });
});

document.getElementById('clipBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  const clipBtn = document.getElementById('clipBtn');
  const subpage = document.getElementById('targetPage').value.trim();
  const userDescription = document.getElementById('description').value.trim();
  
  if (!subpage) return;
  statusDiv.textContent = 'Sending to WikiEducator...';
  clipBtn.disabled = true; // Prevent quick multi-clicks during active request

  const finalTitle = pageContext.title || "Unknown Title";
  const finalUrl = pageContext.url || "";
  const fullTargetPage = `User:${currentUsername}/${subpage}`;
  const localISO = new Date().toLocaleDateString('en-CA');

  const wikitext = `\n{{/Template\n|url=${finalUrl}\n|title=${finalTitle}\n|summary=${userDescription}\n|date=${localISO}}}\n`;

  try {
    const tokenRes = await fetch(`${WIKI_API}?action=tokens&type=edit&format=json`, { credentials: 'include' });
    const tokenData = await tokenRes.json();
    
    if (!tokenData.tokens || !tokenData.tokens.edittoken) {
      statusDiv.textContent = 'Failed to retrieve legacy edit token.';
      clipBtn.disabled = false;
      return;
    }
    const editToken = tokenData.tokens.edittoken;

    const formData = new URLSearchParams();
    formData.append('action', 'edit');
    formData.append('title', fullTargetPage);
    formData.append('appendtext', wikitext);
    formData.append('summary', `Clipped: ${finalTitle}`);
    formData.append('token', editToken);
    formData.append('minor', 1);
    formData.append('format', 'json');

    const editRes = await fetch(WIKI_API, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    const editData = await editRes.json();

    if (editData.edit && editData.edit.result === 'Success') {
      statusDiv.textContent = 'Successfully clipped!';
      // Retain the disabled state on the button so they don't clip twice,
      // but keep the popup window open for 1.5 seconds so they see success.
      setTimeout(() => window.close(), 1500);
    } else {
      statusDiv.textContent = 'Wiki Error: ' + JSON.stringify(editData.error || editData);
      clipBtn.disabled = false; // Re-enable if server threw an error so they can retry
    }
  } catch (err) {
    statusDiv.textContent = 'Write Failed: ' + err.message;
    clipBtn.disabled = false;
  }
});
