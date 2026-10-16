'use client';

import React, { useState, useEffect } from 'react';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isWithinInterval,
  isSaturday,
  isSunday,
} from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

interface BookedDate {
  date: string; // YYYY-MM-DD
  leaveType: string;
}

interface CalendarRangePickerProps {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  onRangeChange: (startDate: string, endDate: string) => void;
  holidays?: Holiday[];
  bookedDates?: BookedDate[];
}

export function CalendarRangePicker({
  startDate,
  endDate,
  onRangeChange,
  holidays = [],
  bookedDates = [],
}: CalendarRangePickerProps) {
  const initialDate = startDate ? new Date(startDate) : new Date();
  const [currentMonth, setCurrentMonth] = useState<Date>(
    isNaN(initialDate.getTime()) ? new Date() : initialDate
  );

  const [selectingStart, setSelectingStart] = useState<string | null>(startDate || null);

  useEffect(() => {
    if (startDate) {
      const d = new Date(startDate);
      if (!isNaN(d.getTime())) {
        setCurrentMonth(d);
      }
    }
  }, [startDate]);

  const holidayMap = new Map<string, string>();
  holidays.forEach((h) => {
    holidayMap.set(h.date, h.name);
  });

  const bookedMap = new Map<string, string>();
  bookedDates.forEach((b) => {
    bookedMap.set(b.date, b.leaveType);
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const handleDateClick = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');

    if (!selectingStart || (startDate && endDate && startDate !== endDate)) {
      setSelectingStart(dateStr);
      onRangeChange(dateStr, dateStr);
    } else {
      const startD = new Date(selectingStart);
      const clickedD = new Date(dateStr);

      if (clickedD < startD) {
        onRangeChange(dateStr, selectingStart);
      } else {
        onRangeChange(selectingStart, dateStr);
      }
      setSelectingStart(null);
    }
  };

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const startParsed = startDate ? new Date(startDate) : null;
  const endParsed = endDate ? new Date(endDate) : null;

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6 space-y-4">
      {/* Navigation Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-extrabold shadow-sm">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 capitalize tracking-tight">
              {format(currentMonth, 'MMMM yyyy', { locale: localeID })}
            </h3>
            <p className="text-xs font-semibold text-slate-500">
              Pilih Tanggal Mulai dan Tanggal Selesai pada kalender di bawah
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevMonth}
            className="p-2 rounded-xl border border-slate-300 hover:bg-slate-100 hover:border-slate-400 transition-colors text-slate-700 font-bold"
            title="Bulan Sebelumnya"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="p-2 rounded-xl border border-slate-300 hover:bg-slate-100 hover:border-slate-400 transition-colors text-slate-700 font-bold"
            title="Bulan Berikutnya"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Weekday Names Header */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-black uppercase tracking-wider text-slate-600 py-1.5 bg-slate-50 rounded-xl">
        <span>Sen</span>
        <span>Sel</span>
        <span>Rab</span>
        <span>Kam</span>
        <span>Jum</span>
        <span className="text-rose-600">Sab</span>
        <span className="text-rose-600">Min</span>
      </div>

      {/* Calendar Days Grid */}
      <div className="grid grid-cols-7 gap-1.5 md:gap-2">
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isWeekend = isSaturday(day) || isSunday(day);

          const holidayName = holidayMap.get(dateStr);
          const isHoliday = Boolean(holidayName);

          const bookedLeaveType = bookedMap.get(dateStr);
          const isBooked = Boolean(bookedLeaveType);

          const isSelectedStart = startParsed && isSameDay(day, startParsed);
          const isSelectedEnd = endParsed && isSameDay(day, endParsed);

          const isInRange =
            startParsed &&
            endParsed &&
            startParsed < endParsed &&
            isWithinInterval(day, { start: startParsed, end: endParsed });

          return (
            <div
              key={dateStr}
              onClick={() => handleDateClick(day)}
              title={
                isBooked
                  ? `🟣 Sudah Ada Cuti: ${bookedLeaveType}`
                  : holidayName
                  ? `🔴 Tanggal Merah: ${holidayName}`
                  : undefined
              }
              className={`relative min-h-[54px] p-2 rounded-xl border flex flex-col items-center justify-between cursor-pointer select-none transition-all ${
                !isCurrentMonth
                  ? 'opacity-25 border-transparent bg-slate-50/50'
                  : isSelectedStart || isSelectedEnd
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-600/40 z-10 font-black'
                  : isInRange
                  ? 'bg-indigo-100 border-indigo-300 text-indigo-950 font-extrabold'
                  : isBooked
                  ? 'bg-purple-100 border-purple-300 text-purple-950 font-extrabold shadow-2xs'
                  : isHoliday
                  ? 'bg-rose-100 border-rose-400 text-rose-950 hover:bg-rose-200 shadow-2xs font-extrabold'
                  : isWeekend
                  ? 'bg-rose-50/80 border-slate-200 text-rose-700 hover:bg-rose-100/60 font-bold'
                  : 'bg-white border-slate-200 text-slate-900 hover:border-indigo-400 hover:bg-indigo-50/40 font-bold'
              }`}
            >
              {/* Day Number */}
              <span className="text-sm md:text-base font-extrabold">{format(day, 'd')}</span>

              {/* Status Badge */}
              {isBooked ? (
                <div
                  className={`w-full text-[9px] font-black px-1 py-0.5 rounded text-center truncate ${
                    isSelectedStart || isSelectedEnd
                      ? 'bg-purple-600 text-white'
                      : 'bg-purple-700 text-white'
                  }`}
                  title={`Sudah ada cuti: ${bookedLeaveType}`}
                >
                  🟣 Cuti Aktif
                </div>
              ) : isHoliday ? (
                <div
                  className={`w-full text-[9px] font-black px-1 py-0.5 rounded text-center truncate ${
                    isSelectedStart || isSelectedEnd
                      ? 'bg-rose-500 text-white'
                      : 'bg-rose-600 text-white'
                  }`}
                  title={holidayName}
                >
                  🔴 Libur
                </div>
              ) : isWeekend && isCurrentMonth ? (
                <span
                  className={`text-[10px] font-bold ${
                    isSelectedStart || isSelectedEnd ? 'text-indigo-100' : 'text-rose-600'
                  }`}
                >
                  Weekend
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Legend & Guidance Footer */}
      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-md bg-indigo-600 border border-indigo-600 inline-block shadow-2xs" />
            <span className="font-bold text-slate-800">Tanggal Terpilih</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-md bg-indigo-100 border border-indigo-300 inline-block" />
            <span className="font-bold text-slate-800">Rentang Cuti</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-md bg-purple-600 inline-block shadow-2xs" />
            <span className="font-bold text-purple-900">🟣 Sudah Ada Cuti</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-md bg-rose-600 inline-block shadow-2xs" />
            <span className="font-bold text-rose-900">🔴 Tanggal Merah (Libur)</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-md bg-rose-50 border border-slate-300 inline-block" />
            <span className="font-bold text-rose-700">Weekend (Sabtu/Minggu)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
