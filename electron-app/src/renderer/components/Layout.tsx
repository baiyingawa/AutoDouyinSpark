import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import LogPanel from './LogPanel';

const Layout: React.FC = () => {
  return (
    <>
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </>
  );
};

export default Layout;
