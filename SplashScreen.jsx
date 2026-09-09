import React, { useRef } from 'react';
import Lottie from 'lottie-react';
import splashAnimation from './LottieAnimations/NexRide splashscr.json';

const SplashScreen = ({ onComplete }) => {
    const lottieRef = useRef(null);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            backgroundColor: '#000000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <div style={{ width: '100%', height: '100%' }}>
                <Lottie
                    lottieRef={lottieRef}
                    animationData={splashAnimation}
                    loop={false}
                    autoplay={true}
                    initialSegment={[0, 91]}
                    onComplete={onComplete}
                    rendererSettings={{
                        preserveAspectRatio: 'xMidYMid slice'
                    }}
                    style={{ width: '100%', height: '100%' }}
                />
            </div>
        </div>
    );
};

export default SplashScreen;
