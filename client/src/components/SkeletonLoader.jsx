import React from 'react';

export const TableSkeleton = ({ rows = 5, cols = 6 }) => {
  return (
    <div className="w-full space-y-3 animate-pulse">
      <div className="h-10 bg-slate-200 rounded-lg w-full mb-4"></div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-8 bg-slate-100 rounded flex-1"
            ></div>
          ))}
        </div>
      ))}
    </div>
  );
};

export const CardSkeleton = ({ count = 4 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-28 bg-slate-100 rounded-xl border border-slate-200 p-4">
          <div className="h-4 bg-slate-200 rounded w-1/2 mb-3"></div>
          <div className="h-7 bg-slate-200 rounded w-3/4"></div>
        </div>
      ))}
    </div>
  );
};

export default { TableSkeleton, CardSkeleton };
