import "./globals.css";

export const metadata = {
  title: "2ni Admin Portal",
  description: "Management console for the 2ni Viral Content Pipeline",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
