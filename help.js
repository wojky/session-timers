/**
 * help.js — Help dialog open/close logic.
 */

const _helpDialog      = document.getElementById('help-dialog');
const _helpDialogClose = document.getElementById('help-dialog-close');
const _helpBody        = document.getElementById('help-dialog-body');
const _helpToc         = document.getElementById('help-toc');

// TOC: scroll spy — highlight active section link
function _updateActiveTocLink() {
  if (!_helpBody || !_helpToc) return;
  const sections = _helpBody.querySelectorAll('section[id]');
  const scrollTop = _helpBody.scrollTop;
  const containerHeight = _helpBody.clientHeight;

  let activeId = sections[0]?.id;
  for (const section of sections) {
    if (section.offsetTop <= scrollTop + containerHeight * 0.35) {
      activeId = section.id;
    }
  }

  for (const link of _helpToc.querySelectorAll('a[href^="#help-s"]')) {
    const isActive = link.getAttribute('href') === '#' + activeId;
    link.classList.toggle('bg-indigo-600', isActive);
    link.classList.toggle('text-white', isActive);
    link.classList.toggle('bg-slate-700', !isActive);
    link.classList.toggle('text-slate-300', !isActive);
  }
}

document.getElementById('btn-help')?.addEventListener('click', () => {
  _helpDialog.showModal();
  requestAnimationFrame(_updateActiveTocLink);
});

_helpDialogClose?.addEventListener('click', () => _helpDialog.close());

_helpDialog?.addEventListener('click', (e) => {
  if (e.target === _helpDialog) _helpDialog.close();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _helpDialog?.open) _helpDialog.close();
});

// TOC: smooth scroll inside #help-dialog-body
_helpToc?.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#help-s"]');
  if (!link) return;
  e.preventDefault();
  const target = _helpBody?.querySelector(link.getAttribute('href'));
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

_helpBody?.addEventListener('scroll', _updateActiveTocLink, { passive: true });
