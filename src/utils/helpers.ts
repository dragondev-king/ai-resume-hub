import dayjs from "dayjs";

export const formatDate = (dateString: string) => {
  if (!dateString) return '';
  try {
    return dayjs(dateString).format('MM/YYYY');
  } catch {
    return dateString;
  }
};
