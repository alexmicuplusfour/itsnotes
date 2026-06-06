import { useRef, useCallback } from 'react';

export const useStickyMonthHeaders = () => {
  const monthSeparatorRefs = useRef(new Map());

  const registerMonthSeparatorRef = useCallback((monthLabel) => (el) => {
    if (el) monthSeparatorRefs.current.set(monthLabel, el);
    else monthSeparatorRefs.current.delete(monthLabel);
  }, []);

  return { monthSeparatorRefs, registerMonthSeparatorRef };
};
