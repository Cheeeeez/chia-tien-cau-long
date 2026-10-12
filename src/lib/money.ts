const nf = new Intl.NumberFormat('vi-VN');

export const formatVnd = (n: number): string => nf.format(n) + 'đ';
export const roundUpThousand = (n: number): number => Math.ceil(n / 1000) * 1000;
export const expenseAmount = (q: number, u: number): number => Math.round(q * u);
