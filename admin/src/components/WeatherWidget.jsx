import React, { useState, useEffect } from 'react';
import SunIcon from '../assets/svg/sun.svg?react';
import SunnyIcon from '../assets/svg/cloud-sunny.svg?react';
import DrizzleIcon from '../assets/svg/cloud-drizzle.svg?react';
import LightningIcon from '../assets/svg/cloud-lightning.svg?react';

export default function WeatherWidget({ userLocation }) {
  const [weatherData, setWeatherData] = useState(null);
  const [currentTime, setCurrentTime] = useState(null);
  const [error, setError] = useState(false);
  const [timeOffset, setTimeOffset] = useState(0);

  useEffect(() => {
    let mounted = true;

    // Default location (Istanbul) to match map default center, or user location if available
    const lat = userLocation?.lat || 41.0082;
    const lng = userLocation?.lng || 28.9784;

    const fetchWeatherAndTime = async () => {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=auto`);
        if (!res.ok) throw new Error('Weather API error');
        const data = await res.json();

        let currentOffset = 0;
        try {
          const timeRes = await fetch(`https://worldtimeapi.org/api/timezone/${data.timezone}`);
          if (timeRes.ok) {
            const timeData = await timeRes.json();
            const realTime = new Date(timeData.utc_datetime).getTime();
            currentOffset = realTime - Date.now();
          } else {
            const fallbackRes = await fetch(`https://timeapi.io/api/Time/current/zone?timeZone=${data.timezone}`);
            if (fallbackRes.ok) {
              const fallbackData = await fallbackRes.json();
              const realTime = new Date(fallbackData.dateTime).getTime();
              currentOffset = realTime - Date.now();
            }
          }
        } catch (timeErr) {
          console.error("Time API error, falling back to system clock", timeErr);
        }

        if (mounted) {
          setTimeOffset(currentOffset);
          setWeatherData({
            temp: data.current.temperature_2m,
            code: data.current.weather_code,
            timezone: data.timezone
          });
        }
      } catch (err) {
        console.error(err);
        if (mounted) setError(true);
      }
    };

    fetchWeatherAndTime();

    return () => {
      mounted = false;
    };
  }, [userLocation]);

  useEffect(() => {
    // User requested to show IST (their local time)
    const tz = 'Asia/Kolkata';

    const updateClock = () => {
      try {
        const now = new Date(Date.now() + timeOffset);
        const timeOptions = {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        };
        const dayOptions = {
          timeZone: tz,
          weekday: 'long'
        };

        const timeString = new Intl.DateTimeFormat('en-US', timeOptions).format(now);
        const dayString = new Intl.DateTimeFormat('en-US', dayOptions).format(now);

        setCurrentTime({ time: timeString, day: dayString });
      } catch (e) {
        console.error("Timezone formatting error", e);
      }
    };

    updateClock();
    const intervalId = setInterval(updateClock, 10000);
    return () => clearInterval(intervalId);
  }, [weatherData, timeOffset]);

  const renderWeatherIcon = (code) => {
    const props = { width: 16, height: 16, style: { color: 'inherit', display: 'flex', alignItems: 'center' } };
    if (code === 0) return <SunIcon {...props} />;
    if ([1, 2, 3].includes(code)) return <SunnyIcon {...props} />;
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return <DrizzleIcon {...props} />;
    if ([95, 96, 99].includes(code)) return <LightningIcon {...props} />;
    return <SunnyIcon {...props} />;
  };

  return (
    <>
      {currentTime && (weatherData || error) ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '13px',
          fontWeight: '500',
          color: '#555',
          whiteSpace: 'nowrap',
          overflow: 'hidden'
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>{currentTime.time}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>{currentTime.day}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
            {error ? 'Weather unavailable' : (
              <>
                {renderWeatherIcon(weatherData.code)}
                <span>{Math.round(weatherData.temp)}°C</span>
              </>
            )}
          </span>
        </div>
      ) : (
        <div className="skeleton" style={{ width: '150px', height: '20px', borderRadius: '8px' }}></div>
      )}
    </>
  );
}
