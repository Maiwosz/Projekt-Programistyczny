console.log("sup");

// Utility function to get element class
const getElement = (selector) => {
	const element = document.querySelector(selector);
	if (element) return element;
	throw Error(`There is no ${selector} class`);
}

// Stuff used to make menu when screen width below 700px
// -----------------------------------------------------
// Get the class for elements from navigation bar ("Dodaj", "Profil", etc.)
const links = getElement(".nav-links");
// Get the class for navigation bar button that appears when screen width below 700px
const navButton = getElement(".nav-button");

// Add function to the navigation bar button
navButton.addEventListener("click", ()=> {
	links.classList.toggle("show-links");
})
// -----------------------------------------------------

// Stuff for image view
// -----------------------------------------------------
// Get the image view element
var imgView = document.getElementById("image-view-id");

// Get all images present on the mainview page
// This probably needs to be changed later
var images = document.getElementsByTagName('img'); 

// Get the image (full display image) from image view element
var imgFromView = document.getElementById("image-zoom-id");

// Get the text element under image
var imgText = document.getElementById("name-id");

// Add function below to all images
// i = 1 to exclude logo
for(var i = 1; i < images.length; i++) {
	images[i].onclick = function(){
		imgView.style.display = "block";
		imgFromView.src = this.src;
		imgText.innerHTML = this.alt;
	}
}

// Get "button" that closes image view
var span = document.getElementsByClassName("close-button")[0];

// Add function that will allow to close image
span.onclick = function() {
	imgView.style.display = "none";
}
// -----------------------------------------------------


