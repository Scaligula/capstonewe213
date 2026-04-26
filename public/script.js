document.addEventListener("DOMContentLoaded", () => {
  const loginResult = document.getElementById("loginResult");

  const tabStudent = document.getElementById("tab-student");
  const tabStaff = document.getElementById("tab-staff");
  const tabAdmin = document.getElementById("tab-admin");
  const tabParent = document.getElementById("tab-parent");
  const authText = document.getElementById("authText");

  const activate = (tab) => {
    tabStudent.classList.remove("active");
    tabStaff.classList.remove("active");
    tabAdmin.classList.remove("active");
    tabParent.classList.remove("active");
    tabStudent.setAttribute("aria-selected", "false");
    tabStaff.setAttribute("aria-selected", "false");
    tabAdmin.setAttribute("aria-selected", "false");
    tabParent.setAttribute("aria-selected", "false");

    if (tab === "student") {
      tabStudent.classList.add("active");
      tabStudent.setAttribute("aria-selected", "true");
      authText.textContent = "Sign in with your email";
    } else if (tab === "staff") {
      tabStaff.classList.add("active");
      tabStaff.setAttribute("aria-selected", "true");
      authText.textContent = "Sign in with your staff email";
    } else if (tab === "admin") {
      tabAdmin.classList.add("active");
      tabAdmin.setAttribute("aria-selected", "true");
      authText.textContent = "Sign in with your authorized admin account";
    } else if (tab === "parent") {
      tabParent.classList.add("active");
      tabParent.setAttribute("aria-selected", "true");
      authText.textContent = "Sign in with your parent email";
    }
  };

  tabStudent.addEventListener("click", () => activate("student"));
  tabStaff.addEventListener("click", () => activate("staff"));
  tabAdmin.addEventListener("click", () => activate("admin"));
  tabParent.addEventListener("click", () => activate("parent"));

  document.getElementById("googleSignIn").addEventListener("click", (event) => {
    event.preventDefault();
    loginResult.className = "alert alert-info mt-3";
    loginResult.textContent = "Redirecting to Google sign-in...";
    window.location.href = "/auth/google";
  });
});

// ===== Global User State =====
let currentUser = null;

// ===== Role-Based Navigation =====
async function initializeRoleBasedNav(expectedRole) {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = '/';
        return;
      }
      throw new Error('Failed to load user info');
    }

    const user = await response.json();
    currentUser = user; // Store user globally

    // Verify user has the expected role
    const userRole = user.role;
    if (userRole !== expectedRole) {
      window.location.href = '/';
      return;
    }

    // Update topbar with user information
    const topbarName = document.getElementById('topbarName');
    const topbarAvatar = document.getElementById('topbarAvatar');
    const topbarInitials = document.getElementById('topbarInitials');
    const userName = document.getElementById('userName');

    if (topbarName) topbarName.textContent = user.name || 'User';
    if (userName) userName.textContent = user.name || 'User';

    if (topbarInitials && user.name) {
      const initials = user.name.split(' ').map(n => n.charAt(0)).join('').toUpperCase();
      topbarInitials.textContent = initials;
    }

    if (topbarAvatar && user.profilePicture) {
      topbarAvatar.innerHTML = `<img src="${user.profilePicture}" alt="Avatar">`;
    }

    // Show Admin Management link for super admins
    const adminMgmtNav = document.getElementById('adminMgmtNav');
    if (adminMgmtNav && user.adminLevel === 'super') {
      adminMgmtNav.style.display = 'flex';
    }

    // Mark the active nav item
    const currentFile = window.location.pathname.split('/').pop() || 'admin-dashboard.html';
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const href = item.getAttribute('href');
      if (href && href.includes(currentFile)) {
        item.classList.add('active');
      }
    });
  } catch (error) {
    console.error('Error initializing nav:', error);
    window.location.href = '/';
  }
}

