import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { StickyMonthHeader, StickyMonthLabel } from './StickyMonthHeader.styled';
import MonthSearchStar from './MonthSearchStar';

const StickyMonthHeaderDisplay = memo(function StickyMonthHeaderDisplay({
  showMonthMarkers,
  searchMode,
  notesByMonth,
  monthSeparatorRefs,
  onMonthLongPress,
  isDarkTheme,
}) {
  const [stickyMonthLabel, setStickyMonthLabel] = useState(null);
  const [stickyMonthData, setStickyMonthData] = useState(null);
  const [shouldShowSticky, setShouldShowSticky] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeout = useRef(null);
  const notesByMonthRef = useRef(notesByMonth);

  useEffect(() => {
    notesByMonthRef.current = notesByMonth;
  }, [notesByMonth]);

  const handleScroll = useCallback(() => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const adjustedScrollTop = scrollTop + 60 + 48; // headerHeight + stickyHeaderHeight

    setIsScrolling(true);
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => setIsScrolling(false), 1500);

    const monthPositions = [];
    for (const monthGroup of notesByMonthRef.current) {
      const element = monthSeparatorRefs.current.get(monthGroup.label);
      if (element) {
        const rect = element.getBoundingClientRect();
        monthPositions.push({
          label: monthGroup.label,
          year: monthGroup.year,
          monthShort: monthGroup.monthShort,
          offsetTop: rect.top + scrollTop
        });
      }
    }

    if (monthPositions.length === 0) return;

    let currentMonth = monthPositions[0];
    let shouldShow = false;
    for (const month of monthPositions) {
      if (adjustedScrollTop >= month.offsetTop) {
        currentMonth = month;
        shouldShow = adjustedScrollTop > month.offsetTop + 20;
      } else {
        break;
      }
    }

    setStickyMonthLabel(currentMonth.label);
    setStickyMonthData(currentMonth);
    setShouldShowSticky(shouldShow);
  }, [monthSeparatorRefs]);

  useEffect(() => {
    if (!showMonthMarkers || searchMode || notesByMonth.length === 0) {
      setShouldShowSticky(false);
      setStickyMonthLabel(null);
      setStickyMonthData(null);
      setIsScrolling(false);
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      return;
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
  }, [handleScroll, showMonthMarkers, searchMode, notesByMonth.length]);

  const show = shouldShowSticky && isScrolling && showMonthMarkers && !searchMode;

  return (
    <StickyMonthHeader $show={show}>
      <StickyMonthLabel
        theme={isDarkTheme ? 'dark' : 'light'}
        onContextMenu={(e) => stickyMonthData && onMonthLongPress(e, stickyMonthData.year, stickyMonthData.monthShort)}
      >
        {stickyMonthLabel}
        {stickyMonthData && (
          <MonthSearchStar
            year={stickyMonthData.year}
            monthShort={stickyMonthData.monthShort}
            monthLabel={stickyMonthData.label}
          />
        )}
      </StickyMonthLabel>
    </StickyMonthHeader>
  );
});

export default StickyMonthHeaderDisplay;
