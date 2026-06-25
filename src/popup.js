const WIKI_API = 'https://wikieducator.org/api.php';
let pageContext = { title: '', url: '' };
let currentUsername = '';
let allTags = [];
let activeTags = [];

// sanitize tag text to prevent breaking wikitext templates
function sanitizeTag(tag) {
  return tag.replace(/[|{}=\[\]\n\r]/g, '').trim();
}

// escape characters that could break template structure in mediawiki
function escapeWikitext(text, preserveNewlines = false) {
  if (!text) return '';
  const escaped = text
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/\|/g, '{{!}}');
  return preserveNewlines
    ? escaped.replace(/\r?\n/g, '<br>')
    : escaped.replace(/\r?\n/g, ' ');
}

// sanitize subpage name to prevent invalid mediawiki title errors
function sanitizeSubpage(name) {
  return name
    .replace(/[\r\n]/g, ' ')      // replace newlines with spaces
    .replace(/[#<>[\]|{}]/g, '') // strip forbidden title characters
    .replace(/^\/+|\/+$/g, '')    // strip leading and trailing slashes
    .replace(/\/+/g, '/')        // convert multiple consecutive slashes to a single slash
    .trim();
}

// load tags and update ui elements
function updateTagsUI() {
  const container = document.getElementById('selected-tags');
  const suggestionsDiv = document.getElementById('tag-suggestions');
  const query = document.getElementById('tag-input').value.trim().toLowerCase();

  // render selected tag pills safely
  container.textContent = '';
  activeTags.forEach(t => {
    const span = document.createElement('span');
    span.className = 'tag-pill';
    span.dataset.tag = t;
    span.textContent = t;
    
    // add close symbol
    const closeSymbol = document.createElement('span');
    closeSymbol.style.marginLeft = '6px';
    closeSymbol.textContent = '×';
    span.appendChild(closeSymbol);
    
    container.appendChild(span);
  });

  // filter suggestion list excluding already active ones
  const suggestions = allTags
    .filter(t => !activeTags.includes(t) && t.toLowerCase().includes(query))
    .slice(0, 4);

  suggestionsDiv.textContent = '';
  if (suggestions.length > 0) {
    const label = document.createElement('span');
    label.textContent = 'Suggestions: ';
    suggestionsDiv.appendChild(label);

    suggestions.forEach(t => {
      const span = document.createElement('span');
      span.className = 'suggestion-chip';
      span.dataset.tag = t;
      span.textContent = t;
      suggestionsDiv.appendChild(span);
      // add a small space between chips
      suggestionsDiv.appendChild(document.createTextNode(' '));
    });
  } else if (query) {
    suggestionsDiv.textContent = 'Press Enter to create new tag';
  }
}

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

  // load tags from storage
  const tagData = await chrome.storage.local.get('recentTags');
  if (tagData.recentTags) {
    allTags = tagData.recentTags;
  } else {
    allTags = ['research', 'ref', 'dev'];
  }
  updateTagsUI();

  // handle tag input keydown for enter key
  document.getElementById('tag-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = sanitizeTag(e.target.value);
      if (val && !activeTags.includes(val)) {
        activeTags.push(val);
        e.target.value = '';
        updateTagsUI();
      }
    }
  });

  // handle typing in tag input for filtering suggestions
  document.getElementById('tag-input').addEventListener('input', updateTagsUI);

  // handle tag clicks for suggestions and active pills
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('suggestion-chip')) {
      const val = sanitizeTag(e.target.dataset.tag);
      if (val && !activeTags.includes(val)) {
        activeTags.push(val);
      }
      document.getElementById('tag-input').value = '';
      updateTagsUI();
    } else {
      const pill = e.target.closest('.tag-pill');
      if (pill) {
        activeTags = activeTags.filter(t => t !== pill.dataset.tag);
        updateTagsUI();
      }
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
      document.getElementById('title').value = title;
      document.getElementById('description').value = summary;
    }
  });
});

document.getElementById('clipBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  const clipBtn = document.getElementById('clipBtn');
  const subpage = sanitizeSubpage(document.getElementById('targetPage').value);
  const userDescription = document.getElementById('description').value.trim();
  
  if (!subpage) return;
  statusDiv.textContent = 'Sending to WikiEducator...';
  clipBtn.disabled = true; // prevent quick multi-clicks during active request

  const finalTitle = escapeWikitext(document.getElementById('title').value.trim() || pageContext.title || "Unknown Title", false);
  const finalUrl = pageContext.url || "";
  const fullTargetPage = `User:${currentUsername}/${subpage}`;
  const localISO = new Date().toLocaleDateString('en-CA');
  const tagsString = activeTags.join(', ');
  const escapedDescription = escapeWikitext(userDescription, true);

  const wikitext = `\n{{/Template\n|url=${finalUrl}\n|title=${finalTitle}\n|summary=${escapedDescription}\n|tags=${tagsString}\n|date=${localISO}}}\n`;

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

      // update and save tags and last subpage to storage
      const updatedTags = [...new Set([...activeTags, ...allTags])].slice(0, 50);
      await chrome.storage.local.set({ recentTags: updatedTags, lastSubpage: subpage });

      // Retain the disabled state on the button so they don't clip twice
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
