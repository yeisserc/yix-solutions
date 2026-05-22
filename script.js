// Navbar Scroll Effect
const navbar = document.querySelector('.navbar');
const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
const mobileMenuIcon = mobileMenuBtn?.querySelector('i');
const mobileMenuLinks = document.querySelectorAll('.nav-links .nav-link, .nav-actions a');

const setMobileMenuState = (isOpen) => {
    if (!navbar || !mobileMenuBtn || !mobileMenuIcon) return;

    navbar.classList.toggle('menu-open', isOpen);
    mobileMenuBtn.setAttribute('aria-expanded', String(isOpen));
    mobileMenuBtn.setAttribute('aria-label', isOpen ? 'Cerrar menú' : 'Abrir menú');
    mobileMenuIcon.className = isOpen ? 'ph ph-x' : 'ph ph-list';
};

if (mobileMenuBtn && navbar) {
    mobileMenuBtn.addEventListener('click', () => {
        const isOpen = navbar.classList.contains('menu-open');
        setMobileMenuState(!isOpen);
    });

    mobileMenuLinks.forEach((link) => {
        link.addEventListener('click', () => setMobileMenuState(false));
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            setMobileMenuState(false);
        }
    });
}

window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// Scroll Reveal Animations
const revealElements = document.querySelectorAll('.fade-up');

const revealCallback = (entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            // Optional: stop observing once revealed
            // observer.unobserve(entry.target);
        }
    });
};

const revealOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.15 // Trigger when 15% of element is visible
};

const revealObserver = new IntersectionObserver(revealCallback, revealOptions);

revealElements.forEach(el => {
    revealObserver.observe(el);
});

// Smooth Scroll for Anchor Links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;
        
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            // Adjust offset for fixed navbar
            const navHeight = document.querySelector('.navbar').offsetHeight;
            const targetPosition = targetElement.getBoundingClientRect().top + window.scrollY - navHeight;
            
            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        }
    });
});
