import React, { useRef, useEffect, useState } from 'react';

export default function ScrollingText({ text, style }) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        setIsOverflowing(textRef.current.scrollWidth > containerRef.current.clientWidth);
      }
    };
    
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    
    // Additional check after a small delay to handle font loading or layout shifts
    const timer = setTimeout(checkOverflow, 100);
    
    return () => {
      window.removeEventListener('resize', checkOverflow);
      clearTimeout(timer);
    };
  }, [text]);

  return (
    <div 
      ref={containerRef} 
      onMouseEnter={() => {
        if (isOverflowing && !isAnimating) setIsAnimating(true);
      }}
      style={{ 
        width: '100%', 
        overflow: 'hidden', 
        whiteSpace: 'nowrap',
        position: 'relative',
        display: 'block',
        ...style
      }}
    >
      <div 
        className={isOverflowing ? "marquee-track" : ""}
        style={{
          display: 'inline-flex',
          animation: isAnimating ? 'scrollTextHover 6s linear 1' : 'none'
        }}
        onAnimationEnd={() => setIsAnimating(false)}
      >
        <div ref={textRef} style={{ paddingRight: isOverflowing ? '50px' : '0' }}>
          {text}
        </div>
        {isOverflowing && (
          <div style={{ paddingRight: '50px' }}>
            {text}
          </div>
        )}
      </div>
    </div>
  );
}
