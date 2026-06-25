// safety.js
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Carousel functionality
    const carouselContainer = document.querySelector('.carousel-container');
    const dots = document.querySelectorAll('.carousel-dots .dot');

    if (carouselContainer && dots.length > 0) {
        carouselContainer.addEventListener('scroll', () => {
            const scrollLeft = carouselContainer.scrollLeft;
            const cardWidth = carouselContainer.offsetWidth;
            
            // Calculate active index based on scroll position
            const activeIndex = Math.round(scrollLeft / cardWidth);
            
            dots.forEach((dot, index) => {
                if (index === activeIndex) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });
        });
    }

    // SOS Button trigger
    const sosBtn = document.querySelector('.em-btn.sos');
    if (sosBtn) {
        sosBtn.addEventListener('click', () => {
            alert('SOS Activated! Sending location to emergency contacts and authorities.');
        });
    }

    // AI Button trigger
    const aiBtn = document.querySelector('.ai-btn');
    if (aiBtn) {
        aiBtn.addEventListener('click', () => {
            alert('NexAI Assistant is ready. How can I help with your safety today?');
        });
    }
});
