// Login page logic — premium edition

function switchTab(tab) {
    const pubTab = document.getElementById('tab-publisher');
    const adminTab = document.getElementById('tab-admin');
    const pubForm = document.getElementById('form-publisher');
    const adminForm = document.getElementById('form-admin');

    if (tab === 'publisher') {
        pubTab.classList.add('tab-active');
        pubTab.classList.remove('text-gray-500', 'hover:text-gray-300');
        adminTab.classList.remove('tab-active');
        adminTab.classList.add('text-gray-500', 'hover:text-gray-300');
        pubForm.classList.remove('hidden');
        adminForm.classList.add('hidden');
    } else {
        adminTab.classList.add('tab-active');
        adminTab.classList.remove('text-gray-500', 'hover:text-gray-300');
        pubTab.classList.remove('tab-active');
        pubTab.classList.add('text-gray-500', 'hover:text-gray-300');
        adminForm.classList.remove('hidden');
        pubForm.classList.add('hidden');
    }
    hideError();
}

function showError(msg) {
    const el = document.getElementById('error-msg');
    el.textContent = msg;
    el.classList.remove('hidden');
}

function hideError() {
    document.getElementById('error-msg').classList.add('hidden');
}

async function loginPublisher(event) {
    event.preventDefault();
    hideError();
    const code = document.getElementById('publisher-code').value.trim();

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code })
        });

        if (!res.ok) {
            const err = await res.json();
            showError(err.detail || 'Invalid publisher code');
            return;
        }

        const data = await res.json();
        localStorage.setItem('token', data.token);
        localStorage.setItem('role', 'publisher');
        localStorage.setItem('publisher_name', data.publisher_name);
        localStorage.setItem('publisher_id', data.publisher_id);
        localStorage.setItem('unique_code', code);
        window.location.href = '/dashboard';
    } catch (err) {
        showError('Connection error. Please try again.');
    }
}

async function loginAdmin(event) {
    event.preventDefault();
    hideError();
    const username = document.getElementById('admin-username').value.trim();
    const password = document.getElementById('admin-password').value;

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password })
        });

        if (!res.ok) {
            const err = await res.json();
            showError(err.detail || 'Invalid credentials');
            return;
        }

        const data = await res.json();
        localStorage.setItem('token', data.token);
        localStorage.setItem('role', 'admin');
        window.location.href = '/admin';
    } catch (err) {
        showError('Connection error. Please try again.');
    }
}
