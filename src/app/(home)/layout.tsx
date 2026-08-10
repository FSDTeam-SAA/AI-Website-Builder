import { Navbar } from "@/modules/home/ui/components/navbar";

interface Props {
  children: React.ReactNode;
};

const Layout = ({ children }: Props) => {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#fafafe] dark:bg-[#08080d]">
      <Navbar />
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-32 top-16 size-[28rem] rounded-full bg-indigo-300/20 blur-[120px] dark:bg-indigo-700/15" />
        <div className="absolute -right-36 top-64 size-[32rem] rounded-full bg-rose-200/25 blur-[130px] dark:bg-rose-700/10" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(99,102,241,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(99,102,241,0.055)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)] dark:opacity-30" />
      </div>
      <div className="relative z-10 flex min-h-screen flex-col">
        {children}
      </div>
    </main>
  );
};
 
export default Layout;
