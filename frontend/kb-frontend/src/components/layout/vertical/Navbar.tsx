// Component Imports
import LayoutNavbar from '@layouts/components/vertical/Navbar'
import NavbarContent from './NavbarContent'

const Navbar = ({ accessToken }: { accessToken: string }) => {
  return (
    <LayoutNavbar>
      <NavbarContent accessToken={accessToken} />
    </LayoutNavbar>
  )
}

export default Navbar
