console.log('sup')

const getElement = (selector) => {
	const element = document.querySelector(selector)
	if (element) return element
	throw Error(`There is no ${selector} class`)
}

const links = getElement('.nav-links')
const navButton = getElement('.nav-button')

navButton.addEventListener('click', ()=> {
	links.classList.toggle('show-links')
})


