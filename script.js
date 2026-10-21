// Switch between forms
function showReg() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('regForm').classList.remove('hidden');
    hideMessages();
}

function showLogin() {
    document.getElementById('regForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
    hideMessages();
}

function showMessage(type, text) {
    hideMessages();
    const element = document.getElementById(type + 'Message');
    element.textContent = text; // textContent = safe from XSS
    element.classList.remove('hidden');
}

function hideMessages() {
    document.getElementById('errorMessage').classList.add('hidden');
    document.getElementById('successMessage').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('showRegisterLink').addEventListener('click', showReg);
    document.getElementById('showLoginLink').addEventListener('click', showLogin);

    // Forms submit normally to login_handler.php (no preventDefault)

    // Show messages sent back by login_handler.php (?error=...&form=register)
    const params = new URLSearchParams(window.location.search);
    if (params.get('form') === 'register') showReg();

    ['error', 'success'].forEach(function (type) {
        const msg = params.get(type);
        if (msg) showMessage(type, msg);
    });

    // Clean the URL so the message doesn't reappear on refresh
    if (window.location.search) {
        history.replaceState(null, '', window.location.pathname);
    }
});