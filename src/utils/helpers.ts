import dayjs from "dayjs";

export const formatDate = (dateString: string, withDay: boolean = false, withTime: boolean = false) => {
  if (!dateString) return '';
  try {
    const format = withDay ? 'MM/DD/YYYY' : 'MM/YYYY';
    return dayjs(dateString).format(format + (withTime ? ' | HH:mm' : ''));
  } catch {
    return dateString;
  }
};
