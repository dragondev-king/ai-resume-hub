import dayjs from "dayjs";

export const formatDate = (dateString: string, withDay: boolean = false) => {
  if (!dateString) return '';
  try {
    return dayjs(dateString).format(withDay ? 'MM/DD/YYYY' : 'MM/YYYY');
  } catch {
    return dateString;
  }
};
