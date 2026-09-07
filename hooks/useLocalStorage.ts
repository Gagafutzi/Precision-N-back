
// Fix: Import React to use React types like React.Dispatch and React.SetStateAction.
import React, { useState, useEffect } from 'react';

function getStorageValue<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') {
    return defaultValue;
  }
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      /*
       * Stored settings are laid over the defaults, not used in place of them.
       *
       * Returned verbatim, a settings object written before a setting existed
       * simply lacks it — so the new key reads `undefined` for everyone who has
       * ever opened the app, and only behaves because `undefined` happens to be
       * falsy. A setting whose default is a number breaks outright: `undefined`
       * reaches the arithmetic and the value becomes NaN.
       *
       * Objects only. `performanceHistory` is an array, and spreading one into
       * an object turns it into `{0: …, 1: …}` and loses every array method.
       */
      const isPlain = (v: unknown): v is Record<string, unknown> =>
        typeof v === 'object' && v !== null && !Array.isArray(v);
      if (isPlain(parsed) && isPlain(defaultValue)) {
        return { ...defaultValue, ...parsed } as T;
      }
      return parsed as T;
    } catch (error) {
      console.error('Error parsing JSON from localStorage', error);
      return defaultValue;
    }
  }
  return defaultValue;
}

export const useLocalStorage = <T,>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] => {
  const [value, setValue] = useState<T>(() => {
    return getStorageValue(key, defaultValue);
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
};
